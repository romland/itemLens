import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import QRUrlDownloader from '$lib/server/urldownloader';
import { summarizeWebpageExtract } from '$lib/server/llm';
import { getSafeFilename } from '$lib/server/photouploads';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import fs from 'fs';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { type, payload } = await request.json();
        console.log(`[Background Task] Received draft document request: type=${type}`);
        let summary = "";
        let title = "";
        let path = "";
        let extracts = "[]";

        const docFilename = getSafeFilename(`draft-doc`);

        if (type === 'url') {
            console.log(`[Background Task] Fetching URL: ${payload}`);
            const result = await QRUrlDownloader.downloadURL(payload);
            if (result) {
                const parsed = JSON.parse(result);
                title = parsed.title;
                extracts = JSON.stringify(parsed.extracts);
                path = `${uploadsWebFolder}/${docFilename}.html`;
                console.log(`[Background Task] Saving HTML to ${path}`);

                fs.writeFileSync(`${uploadsDiskFolder}/${docFilename}.html`, parsed.html, { encoding: "utf8" });

                if (parsed.extracts?.[0] && parsed.extracts[0].length > 50) {
                    console.log(`[Background Task] Summarizing extract with LLM...`);
                    summary = await summarizeWebpageExtract(parsed.extracts[0].substring(0, 5000));
                }
            } else {
                console.warn(`[Background Task] Failed to fetch URL: ${payload}`);
                return json({ error: 'Failed to download URL' }, { status: 400 });
            }
        } else if (type === 'text') {
            title = "Pasted Note";
            extracts = JSON.stringify([payload]);
            path = `${uploadsWebFolder}/${docFilename}.txt`;
            console.log(`[Background Task] Saving text to ${path}`);
            fs.writeFileSync(`${uploadsDiskFolder}/${docFilename}.txt`, payload, { encoding: "utf8" });
            console.log(`[Background Task] Summarizing note with LLM...`);
            summary = await summarizeWebpageExtract(payload.substring(0, 5000));
        }

        console.log(`[Background Task] Finished processing ${type} draft.`);
        return json({ success: true, summary, title, path, extracts, source: payload });
    } catch (e) {
        console.error("Draft document processing error:", e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};