import fs from 'fs';
import { writeFileSync, promises as fsPromises } from "fs";
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

import type { Item, Photo } from '@prisma/client';
import slugify from 'slugify';
import QRUrlDownloader from "$lib/server/urldownloader";


export function processInvoicePhotos(item : Item, remoteSite: string)
{
  for(let i = 0; i < item.photos.length; i++) {
    const photo = item.photos[i];

    if(photo.type !== "invoice or receipt") {
      continue;
    }

    console.log("Dealing with", photo.type, "photo", item.id);

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

export function processOtherPhotos(item : Item, remoteSite: string)
{
  return processProductPhotos(item, remoteSite, ["information", "other"]);
}


/**
 * 
 * @param item 
 * @param remoteSite 
 */
export function processProductPhotos(item : Item, remoteSite: string, acceptTypes: string[] = ["product"], perPhotoCallback = null)
{
  // Deal with each photo
  for(let i = 0; i < item.photos.length; i++) {
    const photo = item.photos[i];

    // if(photo.type !== "product") {
    if(!acceptTypes.includes(photo.type)) {
      continue;
    }

    console.log("Dealing with", photo.type, "photo", item.id);

    if(!photo.orgPath) {
      continue;
    }

    const imgUrl = `${remoteSite}${photo.orgPath}`;

    if(false) {
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
      console.log("Replicate.com's Blip classification is disabled (incurs cost)");
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

      // This is not pretty; it's asynchronous on the other side -- it is used for 'autoFill'.
      // The only requirement is really that we have a thumbnail available so this is not 
      // the best place for this. But it works for now. Holy-moly-prototype.
      if(perPhotoCallback) {
        perPhotoCallback(null, photo);
      }

      // Download any URL in QR codes in the photo (done on thumbnails)
      // REFACTOR: Get rid of this and attempt only on photos of type 'other' or 'information'
      await processQRcodeThenDownload(photo.orgPath, photo, item, (err, res) => {
        if (err) {
          console.log("Did not download (non-)QR file's URL:", err);
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
  let page = await QRUrlDownloader.fetchQRCodeDocument(`static${webFilePath}_thumb.jpg`);
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


export async function downloadQRURLs(data: any, diskFolder: string, webFolder: string, formPrefix: string,
  remoteSite: string, item: { id: number; slug: string; amount: number | null; title: string | null;
  description: string | null; reason: string | null; inventoryId: number | null; authorId: number;
  createdAt: Date; updatedAt: Date; })
{
  const qrPhotos: Photo[] = await savePhotos(data, diskFolder, webFolder, formPrefix);

  for (let i = 0; i < qrPhotos.length; i++) {
    const photo = qrPhotos[i];

    // Process the QR code
    processPhoto(photo, `${remoteSite}${photo.orgPath}`, item, false, false, (err, pageData) => {
      if (err) {
        console.error("Error processing QR code for URL: ", err);
        return;
      }
      console.log("Downloaded explicitly stated URL via QR code:", pageData.url);
    });
  }
}
  
export async function savePhotos(formData: any, diskPath: string, webPath: string, fieldPrefix: string, remoteURLlist: string = ""): Promise<Photo[]>
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
  
  // separate logic to handle remote URL downloads
  let remoteFilesPromises = [];
  if(remoteURLlist.trim().length > 0) {
    remoteURLlist = remoteURLlist.replace("\r\n", "\n");

    const externalUrls = remoteURLlist.trim().split('\n');
    remoteFilesPromises = externalUrls.map(async (urlWithType, index) => {
      const [type, url] = urlWithType.split(' ')
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        
        if(!hasImageExtension(url)) {
          throw "Invalid file extension";
        }

        const filename = getSafeFilename(url.slice(-24), String(index));
        const filePath = `${diskPath}/${filename}`;

        // write file asynchronously 
        await fsPromises.writeFile(filePath, Buffer.from(arrayBuffer));

        // create the photo object and return 
        const photo =  {
          type,
          orgPath: `${webPath}/${filename}`,
          thumbPath: null,
          cropPath: null,
          llmAnalysis: null,
          ocr: null,
          colors: null,
        };

        return photo;

      } catch (error) {
        console.error(`Error fetching and saving file from URL: ${url}, Error: ${error}`);
      }
    });
  }

  try {
    const remotePhotos = await Promise.all(remoteFilesPromises);
    await Promise.all(filePromises);
  
    // merge local file photos and remote file photos and return 
    if((photos.length + remotePhotos.length) === 0 ) {
      return [];
    }
    return [...photos, ...remotePhotos];
  } catch (error) {
    console.error("Error saving files:", error);
    return [];
  }
}

// This is _very_ basic, will fail if there are query parameters etc etc etc etc
function hasImageExtension(url)
{
  return url.toLowerCase().trim().endsWith(".jpg")
      || url.toLowerCase().trim().endsWith(".jpeg")
      || url.toLowerCase().trim().endsWith(".png")
      || url.toLowerCase().trim().endsWith(".svg")
      || url.toLowerCase().trim().endsWith(".webp");
}


export function getSafeFilename(filename: string, extra: string = ""): string
{
  const date = new Date().toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/T/, '')
    .replace(/\..+/, '');

  return date + '-' + extra + "-" + slugify(filename.toLowerCase());
}
