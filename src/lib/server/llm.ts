import { refine, refineForLLM, toTextDocument } from "$lib/shared/ocrparser";
import { env } from '$env/dynamic/private';
import OpenAI from 'openai';
import Groq from 'groq-sdk';

// Get available models:
//  export APIKEY=gsk-...
//  curl -s -H"Authorization: Bearer ${APIKEY}" https://api.groq.com/v1/model_manager/models | jq

const openai = new OpenAI({
    apiKey: env['OPENAI_API_TOKEN'],
});
const groq = new Groq({
    apiKey:  env.GROQ_API_TOKEN
});


export async function extractInvoiceData(ocrData)
{
    // return extractInvoiceDataOpenAI(ocrData);
    return extractInvoiceDataGroq(ocrData);
}
//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

// https://www.npmjs.com/package/openai
async function extractInvoiceDataOpenAI(ocrData)
{
    const prompt = `From the below JSON structure, extract data from it and put it in this new structure:\n` +
        `{ supplier: ...,  products: [ { description: ..., quantity: ..., price: ..., vat: ... }, ` +
        `{ description..., etc }], total: ..., totalIncTaxes, ..., date: ..., invoiceNo: ..., paymentMethod: ... }\n` +
        `If you see obvious typos, correct them. ` + 
        `Make sure numbers are correctly copied. ` +
        // `Do not add products which has description as 'subtotal' or similar things that are not products. ` + 
        `Be brief and concise. ` +
        `Do not give me code. ` + 
        `Do not give me an explanation. ` + 
        `I only need the new JSON data, nothing else.`;

    const refined = refineForLLM(ocrData);

    // TODO: ChatGPT 3.5 is trash for this task. I want Mixtral@Groq for it!
    try {
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: prompt + "\n\n" + JSON.stringify(refined)
                }
            ],
            model: 'gpt-3.5-turbo',
        });
        console.log("OpenAI invoice result:", chatCompletion);
        return chatCompletion.choices[0]?.message?.content || "";
    } catch(ex) {
        console.error("Error contacting OpenAI:", ex);
        return null;
    }
}


// https://www.npmjs.com/package/groq-sdk
async function extractInvoiceDataGroq(ocrData)
{
    const prompt = `From the document (invoice or receipt) below, extract data and put it in this new structure:\n` +
        '```json'+`{ supplier: ...,  items: [ { description: ..., quantity: ..., price: ..., vat: ... }, ` +
        `{ description..., etc }], total: ..., totalIncTaxes, ..., date: ..., invoiceNo: ..., paymentMethod: ... }` + '```\n' +
        `If you see obvious typos, correct them. ` + 
        `Make sure numbers are copied verbatim. ` +
        // `Do not add products which has description as 'subtotal' or similar things that are not products. ` + 
        `If a field cannot be located, set the value to null, e.g.: description: null. ` +
        `Be brief and concise. ` +
        `Do not give me code. ` + 
        `Do not change any numbers. Use them verbatim. ` +
        `I only need the new JSON data, nothing else. `+
        `Do not give me an explanation. `
        ;

    // const refined = refineForLLM(ocrData);
    const refined = toTextDocument(ocrData);

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Please try to provide useful, helpful and actionable answers. If user asks for JSON, give only JSON.'
                },
                {
                    role: "user",
                    content: prompt + "\n\n" + JSON.stringify(refined),
                    // content: prompt + "\n\n" + JSON.stringify(ocrData),
                },
            ],
            response_format: {"type": "json_object"},
            // model: "mixtral-8x7b-32768",
            model: "llama3-70b-8192",
            temperature: 0.2,
            top_p: 0.8,
            // top K 40
        });

        console.log("Groq invoice result:", chatCompletion);
        return chatCompletion.choices[0]?.message?.content || "";
    } catch(ex) {
        console.error("Error contacting Groq:", ex);
        return null;
    }
}

export async function summarizeWebpageExtract(extract)
{
    const prompt = `Below is an extract of a webpage. Give me a brief view of the important details (it's usually about a product or a guide to do something).
Say what product it is about.
Leave out:
- user-generated content such as comments
- navigation elements
- sale/stock information
- reviews
- never give me JSON, I want plain text
and other irrelevant (to the product or guide) stuff that you might find on a webpage.`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Please try to provide useful, helpful and actionable answers. If user asks for JSON, give only JSON, NOTHING else.'
                },
                {
                    role: "user",
                    content: prompt + "\n\n" + extract,
                    // content: prompt + "\n\n" + JSON.stringify(ocrData),
                },
            ],
            response_format: {"type": "json_object"},
            // model: "mixtral-8x7b-32768",
            model: "llama3-70b-8192",
            temperature: 0.2,
            top_p: 0.8,
            // top K 40
        });

        console.log("Groq summary result:", chatCompletion);
        return chatCompletion.choices[0]?.message?.content || "";
    } catch(ex) {
        console.error("Error contacting Groq:", ex);
        return null;
    }
}

/*
Input:
Example 1 : "MB102 Breadboard Power Supply Module 3.3V 5V Solderless Breadboard Voltage Regulator for Arduino Diy Kit"
Example 2 : "HiLetgo power supply for prototype board PCB Universal Breadboard 5V/3.3V output"
*/
export async function getProductFromReverseImageSearch(searchResults)
{
    const prompt = `Below is a list of examples of titles of product pages. They all describe the same product. 
Give me one full name of the product (get rid of all the fluff that is just sales tactics). 
Give me the result as JSON like this (if you cannot find one product, put the explanation for why in a comment field IN the JSON):
{ "productName": ..., "productDescription": ... }`;

    // https://docs.together.ai/docs/json-mode
    // const jsonSchema = {
    //     "type": "object",
    //     "properties": {
    //         "productName": {"type": "string"},
    //         "productDescription": {"type": "string"},
    //         "comment": {"type": "string"}
    //     },
    //     "required": ["productName", "productDescription"]
    // };

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Please try to provide useful, helpful and actionable answers. If user asks for JSON, give only JSON.'
                },
                {
                    role: "user",
                    content: prompt + "\n\n" + searchResults,
                },
            ],
            response_format: {"type": "json_object"},
            // model: "mixtral-8x7b-32768",
            model: "llama3-70b-8192",
            temperature: 0.2,
            top_p: 0.8,
            // top K 40
            // @ts-ignore – Together.ai supports schema while OpenAI does not
            // response_format: { type: 'json_object', schema: jsonSchema },
        });

        console.log("Groq product name result:", chatCompletion);
        return chatCompletion.choices[0]?.message?.content || "";
    } catch(ex) {
        console.error("Error contacting Groq:", ex);
        return null;
    }
}
