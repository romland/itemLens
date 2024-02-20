import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import slugify from 'slugify';
import { writeFileSync, promises as fsPromises } from "fs";
import { db } from '$lib/server/database';
import { getTagIds } from "$lib/server/services";
import UrlDownloader from "$lib/server/urldownloader";
import type { Item, Photo } from '@prisma/client';

import fs from 'fs';

import fetch from 'node-fetch';

// Cropping
import crop from "crop-node";

// Thumbnails
import imageThumbnail from 'image-thumbnail';
import { getTopColorsNamed } from '$lib/server/colors';
import { classifyImageUsingReplicate, jetsonInference } from '$lib/server/classification';
import { getOCRdata } from '$lib/server/ocr';

// TODO consider: Is it faster to check with a model running on Jetson: is there a QR code in the picture?
// TODO: Investigate how fast inference can run on a beefy RasPi (use OpenCL!)

/*
Alright, let the fun begin!

Get KVPs
Containers (need client-side work too, don't think they get set in the select box yet)

I would love to use Mixtral tbh -- but okay, GPT4 will have to do?


*/


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


// deal with containers, KVPs, reason, ?

export const actions = {
    default: async ({ locals, request }) => {
        const data = Object.fromEntries(await request.formData());
        const title = data.title as string;
        const description = data.description as string;
        const tagcsv = data.tagcsv as string;

        console.log("POST data:", data);

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

        const ids = await getTagIds(tagcsv);
        const item : Item = await db.item.create({
            data: {
                title: title.trim(),
                photos: {
                  create: productPhotos
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

        //
        // Download all URLs contained in _uploaded_ pictures containing QR codes (TODO: SECURITY?)
        // (this is largely obsolete after I started using client-side QR code scanner)
        //
        const qrPhotos: Photo[] = await savePhotos(data, diskFolder, webFolder, "qr.");

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

        redirect(302, `/${item.id}/${item.slug}`);
    }
} satisfies Actions;


/**
 * 
 * @param item 
 * @param remoteSite 
 */
function processProductPhotos(item : Item, remoteSite: string)
{
  // Deal with each photo
  for (let i = 0; i < item.photos.length; i++) {
    const photo = item.photos[i];

    if (!photo.orgPath) {
      continue;
    }

    const imgUrl = `${remoteSite}${photo.orgPath}`;

    if (false) {
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

    processPhoto(photo, imgUrl, item, true, true, (err, res) => {
      if(err) {
        console.error(`Failed to process photo ${photo.id} in item ${item.id}`, err);
        return;
      }
      console.log("processPhoto returned for item", item.id);
    });
  }
}

/**
 * Remove background then:
 * 1. crop transparent pixels
 * 2. generate thumbnail
 * 3. get top named colors
 * 4. process any QR code; get URL, download URL
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
      getTopColorsNamed(outputFileNoBkg, (err, result) => {
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

    // Download any URL in QR codes in the photo (done on thumbnails)
    await processQRcodeThenDownload(photo.orgPath, photo, item, (err, res) => {
      if (err) {
        console.log("Error getting top colors:", err);
        callback("Error getting colors", null)
        return;
      }

      callback(null, res)
    });
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


async function savePhotos(formData: FormDataEntryValue[], diskPath: string, webPath: string, fieldPrefix: string): Promise<Photo[]>
{
  const photos: Photo[] = [];
  const filePromises = [];
  let formFile, i = 0;
  while ((formFile = formData[`${fieldPrefix}${i}`] as File)) {
      if (formFile.size > 0) {
          const filename = getSafeFilename(formFile.name);
  
          // Start writing the file asynchronously and push the promise to the array
          filePromises.push(
              formFile.arrayBuffer().then(buffer => {
                const filePath = `${diskPath}/${filename}`;
                return fsPromises.writeFile(filePath, Buffer.from(buffer));
            })
          );
  
          // @ts-expect-error (missing DB fields that will be filled in)
          photos.push({
            type: formData[`${fieldPrefix}.type.${i}`] as string,
            orgPath: `${webPath}/${filename}`,
            thumbPath: null,
            cropPath: null,
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


function getSafeFilename(filename: string): string
{
  const date = new Date().toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/T/, '')
    .replace(/\..+/, '');

  return date + '-' + slugify(filename.toLowerCase());
}

