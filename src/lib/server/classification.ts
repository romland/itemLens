import Replicate from "replicate";
import { env } from '$env/dynamic/private';
import fs from 'fs';

export async function classifyImageUsingReplicate(imgUrl : string, callback)
{
    try {
        const replicate = new Replicate({
            auth: env.REPLICATE_API_TOKEN,
        });
        const output = await replicate.run(
            // Model: blip
            // Runs on nVidia T4 -- https://replicate.com/pricing
            // Task, allowed values: image_captioning, visual_question_answering, image_text_matching
            "salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746",
            {
                input: {
                    task: "image_captioning",
                    question: "describe the type of item depicted, e.g. receipt, invoice, clothing, tool, electronic component, electronic device, chair, table, etc, etc",
                    image: imgUrl,
                }
            }
        );

        console.log("Replicate:", output);
        callback(null, output);
        // return output;
    } catch(ex) {
        console.log("Error asking replicated: ", ex)
        console.error(ex);
        callback(ex, null);
    }
}

// Object classification/categorization/identification (on Jetson)
//
// Note: Changing model is a matter of changing the URL -- need Roboflow key to download model, though.
// there are quite a few PCB inspectors I have not tried (not listed here)
// Screws:     screw-detection-gqosr/2
//    const model = "prueba-1-componentes/1";
//    const model = "komponen-elektronika-skripsi/2";
//    const model = "pcb-collect/1";
//    const model = "coco/13";                         // (crashes... too big?)
//    const model = "resistor-detection-5azes/5";      // this is pretty good in that it's not overfitting (got resistor and breadboard)
//    const model = "qr-code-oerhe/1";                  // perhaps use for fast detection of whether there is a qr code?
//    const model = "electronic-components-d6uul/2";   // decent for electronics!
//    const model = "color-cloth-zecj2/3";    // Triggers swap MADLY. color of cloth
//    const model = "komponen-ujzon/2" // seems to be a shitload of resistors -- but tested with one, no prediction (could be worth look at again)
//    const model = "yolov5-fjfmh/2";   // (warning) electronic components (Saw kswapd climb and then unresponsive)
//
// Curl: base64 rem_20240201231300-item.png | curl -d @- "http://192.168.178.142:9001/prueba-1-componentes/1?api_key=ROBOFLOW_API_TOKEN"
export async function jetsonInference(imagePath : string, callback)
{
  try {
    const fileContent = fs.readFileSync(imagePath);

    const base64Data = Buffer.from(fileContent).toString('base64');
    console.log("jetsonInference debug:", imagePath, fileContent.length, base64Data.length);

    // https://universe.roboflow.com/tc-n4ggt/trash-classification-fvhuk
    // Model Type: Roboflow 2.0 Multi-label Classification
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
      callback(null, result);
    } else {
      console.log('Upload to Jetson failed!', response.status, await response.text());
      callback(response.status, null);
    }
  } catch (error) {
    console.error('Error:', error);
    callback(error, null);
  }
}
