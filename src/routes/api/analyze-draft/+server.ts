// src/routes/api/analyze-draft/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guessProductDetails } from '$lib/server/gemini-classification';
import { getSafeFilename, processDraftPhotoBackground } from '$lib/server/photouploads';
import fs from 'fs';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const data = await request.formData();
        const file = data.get('file') as File;
        const type = data.get('type') as string || 'product';

        if (!file || !file.size) {
            return json({ error: 'No file provided' }, { status: 400 });
        }

        // 1. Save to the staging area immediately
        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = getSafeFilename(file.name, 'draft');
        const localPath = `${uploadsDiskFolder}/${filename}`;
        const webPath = `${uploadsWebFolder}/${filename}`;

        fs.writeFileSync(localPath, buffer);

        // 2. Run the fast Gemini analysis for the UI
        let aiData = null;
        try {
            aiData = await guessProductDetails(localPath);
        } catch (aiError) {
            console.warn("Draft AI Analysis failed:", aiError);
        }

        // 3. Kick off heavy processing in the background for ALL image types (Fire-and-forget)
        processDraftPhotoBackground(webPath, type).catch(e => console.error(e));

        // 4. Return the fast UI updates immediately
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