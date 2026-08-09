import fs from 'fs';
import { writeFileSync, promises as fsPromises } from "fs";
import fetch from 'node-fetch';
import FormData from 'form-data';

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
// import { analyzePhoto } from '$lib/server/gemini-classification';
// import { getExistingCategoryNames, getOrCreateCategory } from '$lib/server/categories';

export async function enrichPhotoData(localPath: string, webPath: string, type: string): Promise<any> {
  const tempPhoto = { id: -1, orgPath: webPath, type } as any;

  const ocrPromise = new Promise((resolve) => {
    getOCRdata(localPath, (err, res) => {
      if (!err) tempPhoto.ocr = JSON.stringify(res);
      resolve(true);
    });
  });

  const imgPromise = new Promise((resolve) => {
    processPhoto(tempPhoto, localPath, { id: -1 } as any, false, true, (err, res) => resolve(true));
  });

  await Promise.all([ocrPromise, imgPromise]);

  let categoryName = null;

  if (type === 'product' || type === 'information' || type === 'other') {
    try {
      const { analyzePhoto } = await import('$lib/server/gemini-classification');
      const { getExistingCategoryNames } = await import('$lib/server/categories');
      const existingCategories = await getExistingCategoryNames();
      const targetPath = tempPhoto.thumbPath ? `static${tempPhoto.thumbPath}` : localPath;
      const analysis = await analyzePhoto(targetPath, existingCategories);
      tempPhoto.llmAnalysis = JSON.stringify(analysis);
      categoryName = analysis.subCategory;
    } catch (e) { console.error("[Background Task] LLM classification failed:", e); }
  } else if (type === 'invoice or receipt') {
    try {
      const { extractInvoiceData } = await import('$lib/server/llm');
      if (tempPhoto.ocr) tempPhoto.llmAnalysis = await extractInvoiceData(JSON.parse(tempPhoto.ocr));
    } catch (e) { console.error("[Background Task] Invoice extraction failed:", e); }
  }

  return {
    ocr: tempPhoto.ocr,
    colors: tempPhoto.colors,
    cropPath: tempPhoto.cropPath,
    thumbPath: tempPhoto.thumbPath,
    llmAnalysis: tempPhoto.llmAnalysis,
    categoryName
  };
}

export async function processDraftPhotoBackground(webPath: string, type: string) {
  console.log(`[Background Task] Starting heavy processing for draft image: ${webPath}`);
  const localPath = `static${webPath}`;
  const data = await enrichPhotoData(localPath, webPath, type);
  fs.writeFileSync(`${localPath}.json`, JSON.stringify(data), 'utf8');
  console.log(`[Background Task] Finished heavy processing for draft image: ${webPath}`);
}

export async function processItemPhotosBackground(item: any) {
  for (const photo of item.photos) {
    if (!photo.orgPath) continue;
    
    if (photo.thumbPath && photo.ocr && photo.llmAnalysis) {
      console.log(`[Background Task] Skipping post-save ML for Photo ${photo.id}, pre-processed via draft.`);
      continue;
    }

    console.log(`[Background Task] Running post-save ML for Photo ${photo.id}`);
    const webPath = photo.orgPath;
    const localPath = `static${webPath}`;

    const enriched = await enrichPhotoData(localPath, webPath, photo.type);

    photo.ocr = enriched.ocr || photo.ocr;
    photo.colors = enriched.colors || photo.colors;
    photo.cropPath = enriched.cropPath || photo.cropPath;
    photo.thumbPath = enriched.thumbPath || photo.thumbPath;
    photo.llmAnalysis = enriched.llmAnalysis || photo.llmAnalysis;

    if (enriched.categoryName) {
        const { getOrCreateCategory } = await import('$lib/server/categories');
        const cat = await getOrCreateCategory(enriched.categoryName);
        photo.categoryId = cat.id;
    }

    await updatePhoto(photo.id, photo);

    if (photo.type !== 'invoice or receipt') {
      await new Promise((resolve) => {
        processQRcodeThenDownload(photo.orgPath, photo, item, resolve);
      });
    }
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
function processPhoto(photo: Photo, imgUrl: string, item: Item, updateDB: boolean, getColors: boolean, callback: any)
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
      responseType: 'buffer' as const,
      jpegOptions: {
        force: true,
        quality: 90
      }
    };

    try {
      const thumbnail = await imageThumbnail(outputFileNoBkg, thumbOptions as any);
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

    // Create original thumbnail (without background removed)
    try {
      const orgThumbnail = await imageThumbnail(`static${photo.orgPath}`, thumbOptions as any);
      fs.writeFileSync(`static${photo.orgPath}_org_thumb.jpg`, orgThumbnail);
    } catch(ex) {
      console.error("Error generating original thumbnail", ex);
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


async function processQRcodeThenDownload(webFilePath: string, photo: Photo, item: Item, callback: any)
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

async function removeBackground(imgUrl: string, outputFileNoBkg: string, callback: any)
{
  // const url = `http://localhost:7000/api/remove?url=${encodeURIComponent(imgUrl)}`;
  const localPath = outputFileNoBkg.replace(/_crop\.png$/, '');
  let response;
  
  try {
    // const response = await fetch(url);
    if (fs.existsSync(localPath)) {
      const form = new FormData();
      form.append('file', fs.createReadStream(localPath));
      response = await fetch('http://localhost:7000/api/remove', {
        method: 'POST',
        body: form,
        headers: form.getHeaders()
      });
    } else {
      console.log(`Local file not found for rembg: ${localPath}, falling back to URL: ${imgUrl}`);
      const url = `http://localhost:7000/api/remove?url=${encodeURIComponent(imgUrl)}`;
      response = await fetch(url);
    }

    if (response && response.ok) {
      const fileStream = fs.createWriteStream(outputFileNoBkg);
      response.body?.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log('Removed background, file downloaded and saved successfully.');
        callback(null, `Success: Image saved as ${outputFileNoBkg}`);
      });
    } else {
      const errBody = await response.text();
      console.error(`RemBG HTTP ${response.status} error:`, errBody);
      callback(`HTTP error! status: ${response.status}`, null);
    }
  } catch (error) {
    console.error('Error while removing background:', error);
    callback(error, null);
  }
}


export async function downloadQRURLs(data: any, diskFolder: string, webFolder: string, formPrefix: string, remoteSite: string, item: any)
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

        let ocr = null, colors = null, llmAnalysis = null, cropPath = null, thumbPath = null;
        const draftPath = formData[`${fieldPrefix}draft.${i}`] as string;

        if (draftPath) {
            const jsonPath = `static${draftPath}.json`;
            if (fs.existsSync(jsonPath)) {
                try {
                    const sidecar = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                    ocr = sidecar.ocr || null;
                    colors = sidecar.colors || null;
                    llmAnalysis = sidecar.llmAnalysis || null;

                    if (sidecar.cropPath) {
                        cropPath = `${webPath}/${filename}_crop.png`;
                        fs.copyFileSync(`static${sidecar.cropPath}`, `static${cropPath}`);
                    }
                    if (sidecar.thumbPath) {
                        thumbPath = `${webPath}/${filename}_thumb.jpg`;
                        fs.copyFileSync(`static${sidecar.thumbPath}`, `static${thumbPath}`);
                    }
                    console.log(`[Background Task] Successfully merged pre-processed sidecar for image ${i}`);
                } catch (e) {
                    console.error(`Error reading sidecar JSON for ${draftPath}:`, e);
                }
            }
        }

        // @ts-expect-error (missing DB fields that will be filled in)
        photos.push({
          type: formData[`${fieldPrefix}type.${i}`] as string,
          orgPath: `${webPath}/${filename}`,
          thumbPath,
          cropPath,
          llmAnalysis,
          ocr,
          colors,
        });
    }
    i++;
  }
  
  // separate logic to handle remote URL downloads
  let remoteFilesPromises: Promise<any>[] = [];
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
function hasImageExtension(url: string)
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
