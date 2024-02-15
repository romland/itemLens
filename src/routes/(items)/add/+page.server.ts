import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import slugify from 'slugify';
import { writeFileSync, promises as fsPromises } from "fs";
import { db } from '$lib/server/database';
import { getTagIds } from "$lib/server/services";
import { env } from '$env/dynamic/private';
import UrlDownloader from "$lib/server/urldownloader";
import type { Item, Photo } from '@prisma/client';

// For background-removal (TODO: Move to use node-fetch instead -- I imported it after all)
import http from 'http';
import fs from 'fs';

// For OCR
import fetch from 'node-fetch';

// Cropping
import crop from "crop-node";

// Thumbnails
import imageThumbnail from 'image-thumbnail';
import { getTopColorsNamed } from '$lib/server/colors';
import { classifyImageUsingReplicate } from '$lib/server/classification';

// TODO: split the shit below into functions
// TODO: For the async tasks below: Create an empty item right away -- then all sub-tasks will do UPDATEs
// TODO: Client page should update itself as new data comes in (can we use existing websocket for that?)
// Consider: Is it faster to check with a jetson model if there is a QR code in the picture?

export const actions = {
    default: async ({ locals, request }) => {
        const data = Object.fromEntries(await request.formData());
        const title = data.title as string;
        const description = data.description as string;
        const tagcsv = data.tagcsv as string;

        if (title.length == 0) {
            return fail(400, {
                error: true,
                message: '<strong>Title</strong> can not be blank.'
            });
        }

        const remoteSite = "https://dev.providi.nl";
        const diskFolder = "static/images/u";
        const webFolder = "/images/u";

        const photos = await saveAllFormPhotosToDisk(data, diskFolder, webFolder, "file.");
        console.log("All files saved:", photos);

        const ids = await getTagIds(tagcsv);
        const item = await db.item.create({
            data: {
                title: title.trim(),
                photos: {
                  create: photos
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
        console.log("ITEM AFTER SAVE:", item);

        if(photos[0].orgPath) {
          let webFilePath = "";

            //
            // NOTE: only doing first photo now!
            //
            webFilePath = photos[0].orgPath;

            const imgUrl = `${remoteSite}${webFilePath}`;


            //
            // Object categorization (or detection! depending on model!)
            // performed by the Jetson Nano. 
            // 
            // TODO: I have not really found a good use for for running
            //       any model on it yet.
            //
            jetsonInference(`static${webFilePath}`);

            //
            // OCR (scene-text detection) the picture (on Ubuntu WSL)
            // This is PaddleOCR with FastAPI (note: No GPU ... yet):
            // start container with: romland@Fluffball:~/PaddleOCRFastAPI$ sudo docker compose up -d
            //
            fetchData(imgUrl);

            //
            // Remove background (on Ubuntu WSL: rembg container)
            //
            //curl -s "http://localhost:7000/api/remove?url=http://input.png" -o output.png
            const url = `http://localhost:7000/api/remove?url=${imgUrl}`;
            const outputFileCropped = `static${webFilePath}_crop.png`;
            
            http.get(url, (res) => {
              const fileStream = fs.createWriteStream(outputFileCropped);
            
              res.pipe(fileStream);
              fileStream.on('finish', async () => {
                fileStream.close();
                console.log('Removed background, file downloaded and saved successfully.');

                //
                // CROP
                //

                // Path to an image file to crop
                const options = {
                    outputFormat: "png",
                };
                // Run the async function and write the result
                (async () => {
                    const cropped = await crop(outputFileCropped, options);
                    // Write the cropped file
                    writeFileSync(outputFileCropped, cropped);
                    console.log("Wrote cropped file");
                    
                    // TODO: It is not guaranteed that the order comes back the same
                    // as I save them in. We need to iterate over Item's photos and
                    // deal with them like that (instead of like now, just taking the
                    // first -- prototype-mode!)
// WE BLOW UP HERE ATM!
// TODO: We need to do this now as it gets pretty ugly to update Photos via Item in Prisma (it would be awesome tho!)
                    item.photos[0].cropPath = outputFileCropped;
                    update(item.id, item);

                    //
                    // Generate thumbnail
                    // (note, thumbnail is a jpg -- for size)
                    //
                    const thumbOptions = {
                      width: 256,
                      responseType: 'buffer',
                      jpegOptions: {
                        force:true,
                        quality:90
                      }
                    };
                    try {
                        const thumbnail = await imageThumbnail(outputFileCropped, thumbOptions);
                        fs.writeFile(`static${webFilePath}_thumb.jpg`, thumbnail, async (err) => {
                            if (err) {
                                throw err;
                            }
                            console.log('Thumbnail saved successfully!');

                            //
                            // Detect QR code (it seems I have better success on thumbnails)
                            // ...and fully download the page at the URL as a 'SinglePage'
                            //
                            let page = await UrlDownloader.fetchQRCodeDocument(`static${webFilePath}_thumb.jpg`);
                            if(page !== null) {
                                const pageData = JSON.parse(page);

                                fs.writeFile(`static${webFilePath}_thumb.html`, pageData.html, {encoding:"utf8"}, (err) => {
                                    if (err) {
                                        throw err;
                                    }

                                    // Output for debug ---
                                    pageData.html = "";
                                    console.log("pageData", pageData);

                                    console.log(`URL saved successfully as: static${webFilePath}_thumb.html`);
                                });
                            }

                        });
                          
                    } catch (err) {
                        console.log("Error generating thumbnail");
                        console.error(err);
                    }

                    // Synchronous
                    getTopColorsNamed(outputFileCropped);

                    // TODO: Remove await and save promise
                    console.log("Replicate.com disabled");
                    // await classifyImageUsingReplicate(imgUrl);

                })();

              });

            }).on('error', (err) => {
              console.error('Remove background: Error downloading file:', err);
            });

        }

        redirect(302, `/${item.id}/${item.slug}`);
    }
} satisfies Actions;

async function update(id : number, data : Item)
{
  await db.item.update({
    where: { id: Number(id) },
    data : data
  });
}

// Object categorization/identification (on Jetson)
// TODO: Need to find a better model for this (it's a matter of changing the URL)
//
// NOTE: SECURITY SECRET TODO REMOVE OR INVALIDATE
//
// Components: komponen-elektronika-skripsi/2
// Screws:     screw-detection-gqosr/2
// PCB comps:  pcb-collect/1

// base64 rem_20240201231300-item.png | curl -d @- "http://192.168.178.142:9001/prueba-1-componentes/1?api_key=ROBOFLOW_API_TOKEN"
async function jetsonInference(imagePath : string)
{
  try {
    const fileContent = fs.readFileSync(imagePath);

    const base64Data = Buffer.from(fileContent).toString('base64');
    console.log("jetsonInference debug:", imagePath, fileContent.length, base64Data.length);

    // there are quite a few PCB inspectors I have not tried (not listed here)
    // const model = "prueba-1-componentes/1";
    // const model = "komponen-elektronika-skripsi/2";
    // const model = "pcb-collect/1";
    // const model = "coco/13";                         // (crashes... too big?)
    // const model = "resistor-detection-5azes/5";      // this is pretty good in that it's not overfitting (got resistor and breadboard)
    // const model = "qr-code-oerhe/1";                  // perhaps use for fast detection of whether there is a qr code?
    // const model = "electronic-components-d6uul/2";   // decent for electronics!
    // const model = "color-cloth-zecj2/3";    // Triggers swap MADLY. color of cloth
    // const model = "komponen-ujzon/2" // seems to be a shitload of resistors -- but tested with one, no prediction (could be worth look at again)
    // const model = "yolov5-fjfmh/2";   // (warning) electronic components (Saw kswapd climb and then unresponsive)

    const model = "trash-classification-fvhuk/1"; // Good for getting clothes/shoes or not. (O = organic?, R = plastic?) Why does this return different result when ran locally? ... Would be nice to determine whether something is clothes/shoes or not

    const url = `http://192.168.178.142:9001/${model}?api_key=${env.ROBOFLOW_API_TOKEN}`;
    const response = await fetch(url, {
      method: 'POST',
      body: base64Data,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    if (response.ok) {
      const result = await response.json();

      console.log('jetsonInference: ', result);
    } else {
      console.log('Upload to Jetson failed!', response.status, await response.text());
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function fetchData(imageUrl : string)
{
  const url = 'http://localhost:8000/ocr/predict-by-url';
//   const formData = new FormData();
//   formData.append('imgurl', imageUrl); //`https://dev.providi.nl/images/rem_20240206142014-__.jpg.png`);
//   formData.append('outtype', 'json');

//   console.log("OCR form:", formData);
  
  try {
    // const response = await fetch(url, {
    //   method: 'POST',
    //   body: formData
    // });
    const response = await fetch(url + "?imageUrl=" + encodeURIComponent(imageUrl), {
      method: 'GET',
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log("OCR result", JSON.stringify(result));
    } else {
      console.log('OCR Error:', response.statusText, response);
    }
  } catch (error) {
    console.log('OCR Error:', error.message);
  }
}


async function saveAllFormPhotosToDisk(formData : FormDataEntryValue[], diskPath : string, webPath : string, fieldPrefix : string) : Promise<Photo[]>
{
  const photos: Photo[] = [];
  const filePromises = [];
  let formFile, i = 0;
  while ((formFile = formData[`${fieldPrefix}${i}`] as File)) {
      if (formFile.size > 0) {
          const date = new Date().toISOString()
              .replaceAll('-', '')
              .replaceAll(':', '')
              .replace(/T/, '')
              .replace(/\..+/, '');
  
          const filename = date + '-' + slugify(formFile.name.toLowerCase());
  
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
