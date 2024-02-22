import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import slugify from 'slugify';
import { writeFileSync, promises as fsPromises } from "fs";
import { db } from '$lib/server/database';
import { getTagIds } from "$lib/server/services";
import UrlDownloader from "$lib/server/urldownloader";
import type { Item, Photo, KVP, Location } from '@prisma/client';

import fs from 'fs';

import fetch from 'node-fetch';

// Cropping
import crop from "crop-node";

// Thumbnails
import imageThumbnail from 'image-thumbnail';
import { getTopColorsNamed } from '$lib/server/colors';
import { classifyImageUsingReplicate, jetsonInference } from '$lib/server/classification';
import { getOCRdata } from '$lib/server/ocr';

// Invoice data
import { extractInvoiceData } from '$lib/server/llm';

// TODO consider: Is it faster to check with a model running on Jetson: is there a QR code in the picture?
// TODO: Investigate how fast inference can run on a beefy RasPi (use OpenCL!)

/*
TODO fields:
  inventory   Inventory? @relation(fields: [inventoryId], references: [id])
  inventoryId Int?
  usage      InUse[] 
*/
/*
- TODO: Need some thinking about logic to take _valuable_ data from photos and apply it to items for searching
*/

export const actions = {
    default: async ({ locals, request }) => {
        const orgData = await request.formData();
        const containers = orgData.getAll("containers");
        const data = Object.fromEntries(orgData);
        const title = data.title as string;
        const description = data.description as string;
        const tagcsv = data.tagcsv as string;

        console.log("data:", data);
        console.log("formData:", orgData);

        if (title.length == 0) {
            return fail(400, {
                error: true,
                message: '<strong>Title</strong> can not be blank.'
            });
        }

        const remoteSite = "https://dev.providi.nl";
        const diskFolder = "static/images/u";
        const webFolder = "/images/u";

        const productPhotos: Photo[] = await savePhotos(data, diskFolder, webFolder, "file.");
        const kvps: KVP[] = formKVPsToDBrows(data);

        const ids = await getTagIds(tagcsv);
        const item : Item = await db.item.create({
            data: {
                title: title.trim(),
                reason: data.reason as string || "",
                amount: parseInt(data.amount as string, 10) || null,
                photos: {
                  create: productPhotos
                },
                attributes: {
                  create: kvps
                },
                // valid (motherfucker)
                locations: {
                  create: containers.map((cont) => {
                    return {
                      container : {
                          connect: { name : cont },
                      }
                    }
                  })
                },
                slug: slugify(title.trim().toLowerCase()),
                description: description.trim(),
                authorId: locals.user.id,
                tags: {
                    connect: [...ids]
                }
            },
            include: {
              photos : true,
            }
        });

        processProductPhotos(item, remoteSite);
        processInvoicePhotos(item, remoteSite);

        // TODO: photos of: product information and other 

        downloadURLs(item, remoteSite, data, diskFolder, webFolder, "qr.");


        redirect(302, `/${item.id}/${item.slug}`);
    }
} satisfies Actions;



async function downloadURLs(item: Item, remoteSite: string, data: any, diskFolder: string, webFolder: string, formPrefix: string)
{
    //
    // Download all URLs contained in _uploaded_ pictures containing QR codes (TODO: SECURITY?)
    // (this is largely obsolete after I started using client-side QR code scanner)
    //
    const qrPhotos: Photo[] = await savePhotos(data, diskFolder, webFolder, formPrefix);

    for(let i = 0; i < qrPhotos.length; i++) {
      const photo = qrPhotos[i];

      // Process the QR code
      processPhoto(photo, `${remoteSite}${photo.orgPath}`, item, false, false, (err, pageData) => {
        if(err) {
          console.error("Error processing QR code for URL: ", err);
          return;
        }
        console.log("Downloaded explicitly stated URL via QR code:", pageData.url);
      });
    }

    //
    // Download all URLs in the URLs field (TODO: SECURITY?)
    //
    const lines = (data.urls as string).split("\n");
    for(let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if(!UrlDownloader.isURL(line)) {
        console.log(`not an URL: ${line}`);
        continue;
      }

      const str: string|null = await UrlDownloader.downloadURL(line);
      if(!str) {
        console.log(`Did not get any result when downloading: ${line}`);
        return;
      }

      const pageData = JSON.parse(str);
      const docFilename = getSafeFilename(`${item.id}-doc`);

      fs.writeFileSync(`static${webFolder}/${docFilename}.html`, pageData.html, { encoding: "utf8" });

      console.log("Creating document from explicit URL", docFilename);
      try {
        await db.document.create({
          data: {
            itemId: item.id,
            type: "uncategorized",
            title: pageData.title,
            source: pageData.url,
            path: `${webFolder}/${docFilename}.html`,
            extracts: JSON.stringify(pageData.extracts)
          }
        });
      } catch (ex) {
        console.error("Error creating document in DB:", ex);
      }

      console.log("Downloaded explicitly stated URL:", line);
    }
}

function processInvoicePhotos(item : Item, remoteSite: string)
{
  for(let i = 0; i < item.photos.length; i++) {
    const photo = item.photos[i];

    if(photo.type !== "invoice or receipt") {
      console.log("Skipping non-invoice:", item.id);
      continue;
    }

    if(!photo.orgPath) {
      continue;
    }

    const imgUrl = `${remoteSite}${photo.orgPath}`;

    getOCRdata(imgUrl, async (err, result) => {
      if (err) {
        console.error("Error getting OCR data", err);
        return;
      }

      console.log("Updating photo.ocr in", photo.id);
      photo.ocr = JSON.stringify(result);
      updatePhoto(photo.id, photo);

      const llmData = await extractInvoiceData(result);
      console.log("Updating photo.llmAnalysis in", photo.id);
      photo.llmAnalysis = llmData;
      updatePhoto(photo.id, photo);
    });

  }
}


/**
 * 
 * @param item 
 * @param remoteSite 
 */
function processProductPhotos(item : Item, remoteSite: string)
{
  // Deal with each photo
  for(let i = 0; i < item.photos.length; i++) {
    const photo = item.photos[i];

    if(photo.type !== "product") {
      console.log("Skipping non-product:", item.id);
      continue;
    }

    if(!photo.orgPath) {
      continue;
    }

    const imgUrl = `${remoteSite}${photo.orgPath}`;

    if(true) {
      classifyImageUsingReplicate(imgUrl, (err, result) => {
        if (err) {
          console.error("Error getting Blip classification", err);
          return;
        }

        console.log("Updating photo.classTrash in", photo.id);
        photo.classBlip = JSON.stringify(result);
        updatePhoto(photo.id, photo);
      });
    } else {
      console.log("Replicate.com disabled (incurs cost)");
    }

    jetsonInference(`static${photo.orgPath}`, (err, result) => {
      if (err) {
        console.error("Error getting Trash classification", err);
        return;
      }

      console.log("Updating photo.classTrash in", photo.id);
      photo.classTrash = JSON.stringify(result);
      updatePhoto(photo.id, photo);
    });

    getOCRdata(imgUrl, (err, result) => {
      if (err) {
        console.error("Error getting OCR data", err);
        return;
      }

      console.log("Updating photo.ocr in", photo.id);
      photo.ocr = JSON.stringify(result);
      updatePhoto(photo.id, photo);
    });

    processPhoto(photo, imgUrl, item, true, true, async (err, res) => {
      if(err) {
        console.error(`Failed to process photo ${photo.id} in item ${item.id}`, err);
        return;
      }

      // Download any URL in QR codes in the photo (done on thumbnails)
      // REFACTOR: Get rid of this and attempt only on photos of type 'other' or 'information'
      await processQRcodeThenDownload(photo.orgPath, photo, item, (err, res) => {
        if (err) {
          console.log("Error downloading QR file's URL:", err);
          return;
        }
      });

      console.log("processPhoto returned for item", item.id);
    });
  }
}


/**
 * Remove background then:
 * 1. crop transparent pixels
 * 2. generate thumbnail
 * 3. get top named colors
 * 
 * @param photo 
 * @param imgUrl 
 * @param item 
 */
function processPhoto(photo: Photo, imgUrl: string, item: Item, updateDB: boolean, getColors: boolean, callback)
{
  // A lot of things will be done after we have removed background ...
  const outputFileNoBkg = `static${photo.orgPath}_crop.png`;
  removeBackground(imgUrl, outputFileNoBkg, async (err, result) => {
    if (err) {
      console.log("Error when removing background:", err);
      return;
    }

    // Note: we are not updating DB with the removed-background ... yet. Crop it first.

    // Crop file
    const cropOptions = {
      outputFormat: "png",
    };
    const cropped = await crop(outputFileNoBkg, cropOptions);
    try {
      writeFileSync(outputFileNoBkg, cropped);
    } catch (ex) {
      console.log("Error writing cropped file:", ex);
      callback("Error writing cropped file", null)
      return;
    }

    console.log("Updating photo.cropPath in", photo.id);
    photo.cropPath = `${photo.orgPath}_crop.png`;
    if(updateDB) {
      updatePhoto(photo.id, photo);
    }

    // Create thumbnail
    const thumbOptions = {
      width: 256,
      responseType: 'buffer',
      jpegOptions: {
        force: true,
        quality: 90
      }
    };

    try {
      const thumbnail = await imageThumbnail(outputFileNoBkg, thumbOptions);
      fs.writeFileSync(`static${photo.orgPath}_thumb.jpg`, thumbnail);
      console.log("Updating photo.thumbPath in", photo.id);
      photo.thumbPath = `${photo.orgPath}_thumb.jpg`;
      if(updateDB) {
        updatePhoto(photo.id, photo);
      }
    } catch(ex) {
      console.error("Error generating thumbnail", ex);
      callback("Error generating thumbnail", null)
      return;
    }

    if(getColors) {
      // Get top colors of no-backgrounded-image
      await getTopColorsNamed(outputFileNoBkg, (err, result) => {
        if (err) {
          console.log("Error getting top colors:", err);
          callback("Error getting colors", null)
          return;
        }
        console.log("Updating photo.colors in", photo.id);
        photo.colors = JSON.stringify(result);
        if(updateDB) {
          updatePhoto(photo.id, photo);
        }
      });
    }

    callback(null, true);
  });

  // Nothing to return...
}


async function processQRcodeThenDownload(webFilePath: string, photo: Photo, item: Item, callback)
{
  // TODO: Ugh, pass in the filename for this:
  let page = await UrlDownloader.fetchQRCodeDocument(`static${webFilePath}_thumb.jpg`);
  if(page !== null) {
    const pageData = JSON.parse(page);

    fs.writeFile(`static${webFilePath}_thumb.html`, pageData.html, { encoding: "utf8" }, async (err) => {
      if (err) {
        console.log("Error saving SinglePage", err);
        callback("Error saving SinglePage", null);
        return;
      }

      console.log("Creating document from QR code in", photo.id);
      try {
        const doc = await db.document.create({
          data: {
            itemId: item.id,
            type: "uncategorized",
            title: pageData.title,
            source: pageData.url,
            path: `${webFilePath}_thumb.html`,
            extracts: JSON.stringify(pageData.extracts)
          }
        });
      } catch (ex) {
        console.error("Error creating document in DB:", ex);
        callback("Error creating document in DB", null);
        return;
      }
      callback(null, pageData);
      
    });
  } else {
    callback("QR code not found", null);
  }
}

async function updatePhoto(id : number, data : Photo)
{
  try {
    await db.photo.update({
      where: { id: Number(id) },
      data : data
    });
  } catch(ex) {
    console.log(`Failed to update Photo ${id} - ${data}:`, ex);
  }
}

async function removeBackground(imgUrl, outputFileNoBkg, callback)
{
  const url = `http://localhost:7000/api/remove?url=${encodeURIComponent(imgUrl)}`;
  
  try {
    const response = await fetch(url);

    if (response && response.ok) {
      const fileStream = fs.createWriteStream(outputFileNoBkg);
      response.body?.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log('Removed background, file downloaded and saved successfully.');
        callback(null, `Success: Image saved as ${outputFileNoBkg}`);
      });
    } else {
      callback(`HTTP error! status: ${response.status}`, null);
    }
  } catch (error) {
    console.error('Error while removing background:', error);
    callback(error, null);
  }
}


async function savePhotos(formData: any, diskPath: string, webPath: string, fieldPrefix: string): Promise<Photo[]>
{
  const photos: Photo[] = [];
  const filePromises = [];
  let formFile, i = 0;
  while ((formFile = formData[`${fieldPrefix}${i}`] as File)) {
    if (formFile.size > 0) {
        const filename = getSafeFilename(formFile.name, String(i));

        // Start writing the file asynchronously and push the promise to the array
        filePromises.push(
            formFile.arrayBuffer().then(buffer => {
              const filePath = `${diskPath}/${filename}`;
              return fsPromises.writeFile(filePath, Buffer.from(buffer));
          })
        );

        // @ts-expect-error (missing DB fields that will be filled in)
        photos.push({
          type: formData[`${fieldPrefix}type.${i}`] as string,
          orgPath: `${webPath}/${filename}`,
          thumbPath: null,
          cropPath: null,
          llmAnalysis: null,
          ocr: null,
          colors: null,
        });
    }
    i++;
  }

  try {
    await Promise.all(filePromises);
    return photos;
  } catch (error) {
    console.error("Error saving files:", error);
    return [];
  }
}

function formKVPsToDBrows(formData: FormData[])
{
  const kvps: KVP[] = [];

  for(const key in formData) {
    if(key.startsWith("kvpK")) {
      const index = parseInt(key.split("-")[1], 10);
      kvps.push({
        key: formData[key],
        value: formData[`kvpV-${index}`]
      })
    }
  }
  return kvps;
}

function getSafeFilename(filename: string, extra: string = ""): string
{
  const date = new Date().toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/T/, '')
    .replace(/\..+/, '');

  return date + '-' + extra + "-" + slugify(filename.toLowerCase());
}


export const load = (async ({ locals, params }) => {
  console.log("add/page.server.ts:", locals, params);
  // TODO: Security -- can be fetched without being logged in now
  // TODO: only get containers for current inventory type (not sure where to set this yet)
  const containers = await db.container.findMany({
      select : {
        name : true,
        parentId : true,
        photoPath : true,
        description : true,
        location : true,
        children : {
          select : {
            name : true,
            parentId : true,
          }
        },
      },
      where: {
          AND: [
              { parentId: null }
          ]
      },
      orderBy: {
        name : "asc"
      }
  });

  return {
    containers: containers
  };
}) satisfies PageServerLoad;
