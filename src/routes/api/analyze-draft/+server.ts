import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guessProductDetails } from '$lib/server/gemini-classification';
import { getSafeFilename } from '$lib/server/photouploads';
import fs from 'fs';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const data = await request.formData();
        const file = data.get('file') as File;

        if (!file || !file.size) {
            return json({ error: 'No file provided' }, { status: 400 });
        }

        // 1. Save to the staging area immediately
        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = getSafeFilename(file.name, 'draft');
        const localPath = `${uploadsDiskFolder}/${filename}`;
        const webPath = `${uploadsWebFolder}/${filename}`;

        fs.writeFileSync(localPath, buffer);

        // 2. Run the fast Gemini analysis
        // Wrapping in try/catch so if AI fails, we still return the uploaded draft path
        let aiData = null;
        try {
            aiData = await guessProductDetails(localPath);
        } catch (aiError) {
            console.warn("Draft AI Analysis failed:", aiError);
        }

        // 3. Return the web path and the AI guess to the frontend
        return json({
            success: true,
            draftPath: webPath,
            aiData
        });

    } catch (e) {
        console.error("Draft upload error:", e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};