import { refine, refineForLLM } from "$lib/shared/ocrparser";
import { env } from '$env/dynamic/private';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: env['OPENAI_API_TOKEN'], // This is the default and can be omitted
});

export async function extractInvoiceData(ocrData)
{
    // https://www.npmjs.com/package/openai
    const prompt = `From the below JSON structure, extract data from it and put it in this new structure:\n` +
        `{ supplier: ...,  products: [ { description: ..., quantity: ..., price: ..., vat: ... }, ` +
        `{ description..., etc }], total: ..., totalIncTaxes, ..., date: ..., invoiceNo: ..., paymentMethod: ... }\n` +
        `If you see obvious typos, correct them. ` + 
        `Make sure numbers are correctly copied. ` +
        // `Do not add products which has description as 'subtotal' or similar things that are not products. ` + 
        `Be brief and concise. ` +
        `Do not give me code. ` + 
        `Do not give me an explanation. ` + 
        `I only need the new JSON data.`;


    const refined = refineForLLM(ocrData);

    // console.log("llm.ts: refined blocks:", refine(ocrData));
    // console.log("llm.ts: refined blocks:", refined);

    // TODO: ChatGPT 3.5 is trash for this task. I want Groq for it!
    try {
        const chatCompletion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt + "\n\n" + JSON.stringify(refined) }],
            model: 'gpt-3.5-turbo',
        });
        console.log("llm.ts: result:", chatCompletion);
        return chatCompletion.choices[0]?.message?.content;
    } catch(ex) {
        console.error("Error contacting OpenAI:", ex);
        return null;
    }
}
