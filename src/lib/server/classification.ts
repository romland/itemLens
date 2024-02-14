import Replicate from "replicate";
import { env } from '$env/dynamic/private';

export async function classifyImageUsingReplicate(imgUrl : string)
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
        return output;
    } catch(ex) {
        console.log("Error asking replicated: ", ex)
        console.error(ex);
    }
}
