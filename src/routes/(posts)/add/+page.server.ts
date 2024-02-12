import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import slugify from 'slugify';
import { writeFileSync } from "fs";
import { db } from '$lib/server/database';
import { getTagIds } from "$lib/server/services";
import { env } from '$env/dynamic/private';
import UrlDownloader from "$lib/server/urldownloader";

// For background-removal (TODO: Move to use node-fetch instead -- I imported it after all)
import http from 'http';
import fs from 'fs';

// For OCR
import fetch from 'node-fetch';
import FormData from 'form-data';

// Color extraction
// import { topColours, topColoursHex } from '@colour-extractor/colour-extractor';
import path from "path";
// import ColorThief from 'colorthief';
import { getPalette } from "$lib/server/colorthief";

// Color names
import namer from 'color-namer';

// Cropping
import crop from "crop-node";

// CLIP (at replicate.com)
import Replicate from "replicate";

// Thumbnails
import imageThumbnail from 'image-thumbnail';


export const actions = {
    default: async ({ locals, request }) => {
        const data = Object.fromEntries(await request.formData());

        const title = data.title as string;
        const content = data.content as string;
        const tagcsv = data.tagcsv as string;
        const file = data.file as File;

        if (title.length == 0) {
            return fail(400, {
                error: true,
                message: '<strong>Title</strong> can not be blank.'
            });
        }

        let filename = '';
// TODO: Get new database model in
// TODO: Create an empty item right away -- then all sub-tasks will do UPDATEs
// TODO: Client page should update itself as new data comes in (can we use existing websocket for that?)
// Consider: Is it faster to check with a jetson model if there is a QR code in the picture?
// Consider: Throw

        console.log("file object: ", file);
        if (file.size > 0) {
            const date = new Date().toISOString()
                .replaceAll('-', '')
                .replaceAll(':', '')
                .replace(/T/, '')
                .replace(/\..+/, '');

            filename = date + '-' + slugify(file.name.toLowerCase());

            writeFileSync(`static/images/${filename}`, Buffer.from(await file.arrayBuffer()));

            const imgUrl = `https://dev.providi.nl/images/${filename}`;


            //
            // Object categorization (or detection! depending on model!)
            // performed by the Jetson Nano. 
            // 
            // TODO: I have not really found a good use for for running
            //       any model on it yet.
            //
            jetsonInference(`static/images/${filename}`);

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
            const outputFileCropped = `static/images/${filename}_crop.png`;
            
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
                const path = process.cwd() + "/" + outputFileCropped;
                const options = {
                    outputFormat: "png",
                };
                // Run the async function and write the result
                (async () => {
                    const cropped = await crop(path, options);
                    // Write the cropped file
                    writeFileSync(outputFileCropped, cropped);
                    console.log("Wrote cropped file");

                    //
                    // Generate thumbnail
                    // (note, thumbnail is a jpg -- for size)
                    //
                    let thumbOptions = { width: 256, responseType: 'buffer' , jpegOptions: { force:true, quality:90 } };
                    try {
                        const thumbnail = await imageThumbnail(outputFileCropped, thumbOptions);
                        fs.writeFile(`static/images/${filename}_thumb.jpg`, thumbnail, async (err) => {
                            if (err) {
                                throw err;
                            }
                            console.log('Thumbnail saved successfully!');

                            //
                            // Detect QR code (it seems I have better success on thumbnails)
                            // ...and fully download the page at the URL as a 'SinglePage'
                            //
                            let page = await UrlDownloader.fetchQRCodeDocument(`static/images/${filename}_thumb.jpg`);
                            if(page !== null) {
                                const pageData = JSON.parse(page);

                                fs.writeFile(`static/images/${filename}_thumb.html`, pageData.html, {encoding:"utf8"}, (err) => {
                                    if (err) {
                                        throw err;
                                    }

                                    // Output for debug ---
                                    pageData.html = "";
                                    console.log("pageData", pageData);

                                    console.log(`URL saved successfully as: static/images/${filename}_thumb.html`);
                                });
                            }

                        });
                          
                    } catch (err) {
                        console.log("Error generating thumbnail");
                        console.error(err);
                    }

                    //
                    // Extract top colors
                    //
                    // const img = path.resolve(process.cwd() + "/" + outputFile);
                    const img = outputFileCropped;
                    console.log("Extracting colors from", img);

                    // ColorThief.getColor(img)
                    //     .then(color => { console.log("colorThief color:", color) })
                    //     .catch(err => { console.log(err) })
                    
                    // 2nd arg = num colors, 3rd arg = "quality" (step pixels to skip between sampling)
                    // ColorThief.getPalette(img, 5, 5)
                    getPalette(img, 5, 1)
                        .then(palette => { 
                            const colorNames = [];
                            console.log("colorThief palette:", palette);
                            for(let i = 0; i < palette.length; i++) {
                                const hexCol = rgbToHex(palette[i][0], palette[i][1], palette[i][2]).toUpperCase();
                                // console.log("hex:", hexCol);
                                console.log(`<div style='height:100; width:100; background-color: ${hexCol}'></div>`);

                                // color-namer
                                const colorName = namer(hexCol, { distance:"deltae", pick: ['basic', "pantone"] });
                                if(colorName.basic[0].distance < 25)
                                {
                                    colorNames.push(colorName.basic[0].name.toLowerCase());
                                }
                                if(colorName.pantone[0].distance < 25)
                                {
                                    colorNames.push(colorName.pantone[0].name.toLowerCase());
                                }
                            }

                            console.log("Color names:", [...new Set(colorNames)]);
                        })
                        .catch(err => { console.log(err) })

                    //
                    // Model at replicate
                    //
                    /*
                    try {
                      console.log("Asking Replicate.com...");
                      const replicate = new Replicate({
                          auth: env.REPLICATE_API_TOKEN,
                      });
                      const output = await replicate.run(
                          // CLIP; uses 'model' and 'use_beam_search'
                          //"rmokady/clip_prefix_caption:9a34a6339872a03f45236f114321fb51fc7aa8269d38ae0ce5334969981e4cd8",

                          // cjwbw/internlm-xcomposer (sadly pretty slow)
                          // Nvidia A40 (Large) 
                          // uses:
                          //  image
                          //  text
                          // "cjwbw/internlm-xcomposer:d16df299dbe3454023fcb47ed48dbff052e9b7cdf2837707adff3581edd11e95",

                          // llava-13b (Nvidia A40 (Large))
                          // uses: prompt, top_p, prompt, max_tokens, temperature
                          // "yorickvp/llava-13b:e272157381e2a3bf12df3a8edd1f38d1dbd736bbb7437277c8b34175f8fce358",

                          // mplug-owl
                          // Pretty good, but runs on an A100
                          // Prompt:
                          // What type of item does the image contain, e.g. clothing, tool, electronics, home appliance, table, chair, etc.
                          // "joehoover/mplug-owl:51a43c9d00dfd92276b2511b509fcb3ad82e221f6a9e5806c54e69803e291d6b",
                          // {
                          //   input: {
                          //     img: "https://replicate.delivery/pbxt/Io5RPgJuXv0NrYiefJ6mW7jadKLxebgsaZo0iyGJngHR93cv/fishfeet.webp",
                          //     seed: -1,
                          //     debug: false,
                          //     top_k: 25,
                          //     top_p: 1,
                          //     prompt: "I designed these sandals. Can you help me write an advertisement?\n",
                          //     max_length: 500,
                          //     temperature: 0.75,
                          //     penalty_alpha: 0.25,
                          //     length_penalty: 1,
                          //     repetition_penalty: 1,
                          //     no_repeat_ngram_size: 0
                          //   }
                          // }                        


                          // blip
                          // Nvidia T4 -- https://replicate.com/pricing
                          //  image: 
                          //  task: Allowed values:image_captioning, visual_question_answering, image_text_matching
                          "salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746",
                          {
                              input: {
                                  // top_p: 1,
                                  // max_tokens: 1024,
                                  // temperature: 0.2,
                                  // prompt: "List details of the picture. Include brands if they can be determined. Be concise and brief.",
                                  task: "image_captioning",
                                  question: "describe the type of item depicted, e.g. receipt, invoice, clothing, tool, electronic component, electronic device, chair, table, etc, etc",

                                  // model: "conceptual-captions", //"coco",
                                  // use_beam_search: true
                                  // text: "List details of the picture. Include brands if they can be determined. Be concise and brief.",
                                  // image: `https://dev.providi.nl/images/rem_${filename}.png`,
                                  image: imgUrl,
                              }
                          }
                      );
                      console.log("Replicate:", output);
                    } catch(ex) {
                      console.log("Error asking replicated: ", ex)
                      console.error(ex);
                    }
                    */

                })();

              });

            }).on('error', (err) => {
              console.error('Remove background: Error downloading file:', err);
            });

        }

        const ids = await getTagIds(tagcsv);
        
        const post = await db.post.create({
            data: {
                title: title.trim(),
                photo: filename,
                slug: slugify(title.trim().toLowerCase()),
                content: content.trim(),
                authorId: locals.user.id,
                tags: {
                    connect: [...ids]
                }
            }
        });

        redirect(302, `/${post.id}/${post.slug}`);
    }
} satisfies Actions;


const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => {
  const hex = x.toString(16)
  return hex.length === 1 ? '0' + hex : hex
}).join('')



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


const sendFile = async (uri : string, filePath : string) => {
  const fileStream = fs.createReadStream(filePath);

  const formData = new FormData();
  formData.append('file', fileStream);

  const response = await fetch(uri, {
    method: 'POST',
    body: formData
  });

  if (response.ok) {
    console.log('OCR File uploaded successfully!', await response.json());
  } else {
    console.error('OCR File upload failed!', response);
  }
};

async function fetchData(imageUrl)
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
