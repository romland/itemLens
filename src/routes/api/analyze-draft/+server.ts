import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guessProductDetails, analyzePhoto } from '$lib/server/gemini-classification';
import { getSafeFilename, processDraftPhotoBackground, activeDrafts } from '$lib/server/photouploads';
import fs from 'fs';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import { apiQueue } from '$lib/server/queue/index';
import sharp from 'sharp';
import { getActiveSchema } from '$lib/server/ontology';
import { getExistingCategoryNames } from '$lib/server/categories';
import { db } from '$lib/server/database';
import crypto from 'crypto';
import { normalizeStr, computeMatch, isUseless, findBestMatch, buildDuplicateDetails } from '$lib/server/matcher';

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
        const hash = crypto.createHash('sha1').update(rawBuffer).digest('hex');
        const buffer = await sharp(rawBuffer).rotate().withMetadata().webp({ quality: 85 }).toBuffer();
        const filename = getSafeFilename(file.name, 'draft') + '.webp';
        const localPath = `${uploadsDiskFolder}/${filename}`;
        const webPath = `${uploadsWebFolder}/${filename}`;
        
        fs.writeFileSync(localPath, buffer);
        
        // Run the fast Gemini analysis for the UI
        let aiData = null;
        let classificationData = null;
        let isDuplicate = false;
        let duplicateItemDetails = null;
        let activeSchema: any[] = [];
        try {
            const vault = await db.inventory.findUnique({ where: { id: locals.activeInventoryId }, select: { allowNewCategories: true } });
            const allowNew = vault?.allowNewCategories ?? true;
            const fullSchema = await getActiveSchema(locals.activeInventoryId, null, true);
            const existingCategories = await getExistingCategoryNames(locals.activeInventoryId);

            // SINGLE LLM CALL: Gets title, description, and taxonomy in one shot.
            // We pass the full universe of schemas so the LLM can extract what it needs regardless of the eventual category.
            const analyzePromise = apiQueue.add(() => analyzePhoto(localPath, existingCategories, allowNew, fullSchema), { targetType: 'global', targetId: 0, description: 'Extracting taxonomy and title' });
            
            activeDrafts.set(hash, analyzePromise);
            setTimeout(() => activeDrafts.delete(hash), 5 * 60 * 1000); // 5 min TTL
            
            classificationData = await analyzePromise;
            
            // Resolve the category the AI just picked so we can filter the schema down for the UI
            let resolvedCatId = null;
            if (classificationData?.subCategory) {
                const { getOrCreateCategory } = await import('$lib/server/categories');
                const cat = await getOrCreateCategory(classificationData.subCategory, locals.activeInventoryId);
                resolvedCatId = cat.id;
            }
            
            // STRICT SCOPING: Only send Global fields + Fields belonging to the specific category to the UI
            activeSchema = fullSchema.filter(f => !f.categoryId || f.categoryId === resolvedCatId);

            if (classificationData?.extractedAttributes) {
                // Cold-start awareness: If the category is brand new and has no specific schema yet, allow it to borrow relevant fields.
                const categoryHasSpecificFields = fullSchema.some(f => f.categoryId === resolvedCatId);
                const allowedKeys = new Set((categoryHasSpecificFields ? activeSchema : fullSchema).map(s => s.name));
                
                const filtered: any = {};
                for (const [k, v] of Object.entries(classificationData.extractedAttributes)) {
                    if (allowedKeys.has(k) && v !== null && v !== '') {
                        filtered[k] = v;
                        if (!activeSchema.some(s => s.name === k)) {
                            const borrowedField = fullSchema.find(f => f.name === k);
                            if (borrowedField) activeSchema.push(borrowedField);
                        }
                    }
                }
                classificationData.extractedAttributes = filtered;
            }

            if (classificationData) {
                const existingItems = await db.item.findMany({
                    where: { inventoryId: locals.activeInventoryId },
                    include: { attributes: true, locations: { include: { container: true } }, photos: true }
                });

                console.log("\n[DEBUG] --- DUPLICATE CHECK START ---");
                console.log("[DEBUG] Scan Title:", classificationData.title);
                console.log("[DEBUG] Scan Attrs:", classificationData.extractedAttributes);
                console.log("[DEBUG] Active Schema Fields:", activeSchema.map(s => s.name).join(', '));

                const bestMatch = findBestMatch(classificationData.extractedAttributes || {}, classificationData.title || '', classificationData.description || classificationData.subtitle || '', '', existingItems, activeSchema, classificationData.subCategory);
                
                if (bestMatch) {
                    isDuplicate = true;
                    console.log(`[DEBUG] ⚠️ BEST MATCH: ID ${bestMatch.dbItem.id} "${bestMatch.dbItem.title}" (Score: ${bestMatch.match.score})`);
                    console.log(`[DEBUG] Trace:\n  ` + bestMatch.match.debugTrace?.join('\n  '));
                    duplicateItemDetails = buildDuplicateDetails(bestMatch.dbItem, bestMatch.match);
                }
            }

            aiData = {
                title: classificationData?.title,
                description: classificationData?.description || classificationData?.subtitle || null,
                extractedAttributes: classificationData?.extractedAttributes,
                photoType: classificationData?.photoType,
                subCategory: classificationData?.subCategory,
                isDuplicate,
                duplicateItemDetails
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
                    extractedAttributes: classificationData?.extractedAttributes ? JSON.stringify(classificationData.extractedAttributes) : null,
                    foregroundBox: classificationData.foregroundBox || null
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
            aiData,
            activeSchema
        });
        
    } catch (e) {
        console.error("Draft upload error:", e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};