import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guessProductDetails } from '$lib/server/gemini-classification';
import { uploadsDiskFolder } from '$lib/server/constants';
import path from 'path';
import { apiQueue } from '$lib/server/queue/index';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { draftPath, hint } = await request.json();
        
        if (!draftPath || !hint) {
            return json({ error: 'Missing parameters' }, { status: 400 });
        }

        // Map web path back to local disk path
        const filename = path.basename(draftPath);
        const localPath = `${uploadsDiskFolder}/${filename}`;

        const aiData = await apiQueue.add(
            () => guessProductDetails(localPath, hint),
            { targetType: 'global', targetId: 0, description: 'Refining draft details via AI' }
        );

        return json({
            success: true,
            aiData
        });

    } catch (e) {
        console.error("Draft refine error:", e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};