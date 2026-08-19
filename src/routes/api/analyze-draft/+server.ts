import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guessProductDetails, analyzePhoto } from '$lib/server/gemini-classification';
import { getSafeFilename, processDraftPhotoBackground } from '$lib/server/photouploads';
import fs from 'fs';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import { apiQueue } from '$lib/server/queue/index';
import sharp from 'sharp';
import { getActiveSchema } from '$lib/server/ontology';
import { getExistingCategoryNames } from '$lib/server/categories';
import { db } from '$lib/server/database';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const data = await request.formData();
        const file = data.get('file') as File;
        const type = data.get('type') as string || 'product';
        
        if (!file || !file.size) {
            return json({ error: 'No file provided' }, { status: 400 });
        }
        
        // Save to the staging area immediately
        const rawBuffer = Buffer.from(await file.arrayBuffer());
        const buffer = await sharp(rawBuffer).rotate().withMetadata().webp({ quality: 85 }).toBuffer();
        const filename = getSafeFilename(file.name, 'draft') + '.webp';
        const localPath = `${uploadsDiskFolder}/${filename}`;
        const webPath = `${uploadsWebFolder}/${filename}`;
        
        fs.writeFileSync(localPath, buffer);
        
        // Run the fast Gemini analysis for the UI
        let aiData = null;
        let classificationData = null;
        try {
            const vault = await db.inventory.findUnique({ where: { id: locals.activeInventoryId }, select: { allowNewCategories: true } });
            const allowNew = vault?.allowNewCategories ?? true;
            const activeSchema = await getActiveSchema(locals.activeInventoryId, null, true);
            const existingCategories = await getExistingCategoryNames(locals.activeInventoryId);

            // SINGLE LLM CALL: Gets title, description, and taxonomy in one shot.
            classificationData = await apiQueue.add(() => analyzePhoto(localPath, existingCategories, allowNew, activeSchema), { targetType: 'global', targetId: 0, description: 'Extracting taxonomy and title' });

            aiData = {
                title: classificationData?.title,
                description: classificationData?.description || classificationData?.subtitle || null,
                extractedAttributes: classificationData?.extractedAttributes,
                photoType: classificationData?.photoType,
                subCategory: classificationData?.subCategory
            };

            // WRITE EARLY JSON TO PREVENT RACE CONDITIONS
            // This ensures that if the user clicks Save immediately, savePhotos reads this and sets photo.llmAnalysis.
            // Which in turn prevents processItemPhotosBackground from running redundant LLM calls and duplicating KVPs.
            if (classificationData) {
                const initialDraftData = {
                    title: classificationData.title || null,
                    description: classificationData.description || classificationData.subtitle || null,
                    llmAnalysis: JSON.stringify(classificationData),
                    categoryName: classificationData?.subCategory || null,
                    extractedAttributes: classificationData?.extractedAttributes ? JSON.stringify(classificationData.extractedAttributes) : null
                };
                fs.writeFileSync(`${localPath}.json`, JSON.stringify(initialDraftData), 'utf8');
            }

        } catch (aiError) {
            console.warn("Draft Analysis failed:", aiError);
        }
        
        // Kick off heavy processing in the background for ALL image types (Fire-and-forget)
        processDraftPhotoBackground(webPath, type, locals.activeInventoryId, classificationData).catch(e => console.error(e));
        
        // Return the fast UI updates immediately
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