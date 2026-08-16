import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';
import { ioQueue } from '$lib/server/queue/index';
import sharp from 'sharp';
import slugify from 'slugify';
import fs from 'fs';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
  import { getSafeFilename, processItemPhotosBackground } from '$lib/server/photouploads';
import { taskManager } from '$lib/server/taskManager';
import { getTagIds } from '$lib/server/services';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { draftPath, noteId, containers, items, globalCategory, tagcsv } = await request.json();
    const userId = locals.user.id;
    const inventoryId = locals.activeInventoryId;
    
    // Fire and forget background worker
    ioQueue.add(async () => {
        const taskId = taskManager.start('global', 0, `Saving ${items.length} items from collection...`);
        try {
            // Pre-process tags
            const tagIds = tagcsv ? await getTagIds(tagcsv, inventoryId) : [];

            // 1. Context Preservation: Update the pre-created notebook entry
            if (noteId) {
                await db.timelineNote.update({
                    where: { id: noteId, inventoryId },
                    data: {
                        content: `Collection Scan - ${containers?.length ? containers.join(', ') : 'Unassigned Location'}`,
                    }
                });
            }

            // 2. Load high-res panorama
            const localDraftPath = `static${draftPath}`;
            const img = sharp(localDraftPath);
            const metadata = await img.metadata();
            const { width, height } = metadata;
            
            // 3. Process approved items
            for (const item of items) {
                // Normalize coordinates to actual px dimensions
                const [ymin, xmin, ymax, xmax] = item.box;
                let top = Math.max(0, Math.floor((ymin / 1000) * height!));
                let left = Math.max(0, Math.floor((xmin / 1000) * width!));
                let boxW = Math.max(1, Math.floor(((xmax - xmin) / 1000) * width!));
                let boxH = Math.max(1, Math.floor(((ymax - ymin) / 1000) * height!));
                
                // Enforce sharp boundary limits
                if (left + boxW > width!) boxW = width! - left;
                if (top + boxH > height!) boxH = height! - top;
                
                const cropFilename = getSafeFilename(item.title || 'item', 'org');
                const cropLocalPath = `${uploadsDiskFolder}/${cropFilename}.webp`;
                const cropWebPath = `${uploadsWebFolder}/${cropFilename}.webp`;
                
                // Extract the physical spine and save as pure WebP
                await img.clone().extract({ left, top, width: boxW, height: boxH }).webp({quality: 85}).toFile(cropLocalPath);

               
                // Build KVP array dynamically
                const attributesToCreate = [];
                if (item.subtitle) attributesToCreate.push({ key: "Subtitle", value: item.subtitle });
                attributesToCreate.push({ key: "Source Scan", value: draftPath });

                // Respect item-level category unless user explicitly typed an override
                const finalCategoryName = globalCategory?.trim() || item.category || 'Unknown';
                
                // Formally categorize it like the standard upload pipeline does
                const { getOrCreateCategory } = await import('$lib/server/categories');
                const cat = await getOrCreateCategory(finalCategoryName, inventoryId);

                // Mock the ML response so the UI recognizes the category without needing an expensive API call per item
                const simulatedLlmAnalysis = JSON.stringify({
                    photoType: 'product',
                    subCategory: finalCategoryName.toLowerCase(),
                    isNewCategory: false,
                    description: item.title || 'Collection item'
                });

                // Assemble the item
                const createdItem = await db.item.create({
                    data: {
                        title: item.title,
                        inventoryId,
                        slug: slugify((item.title || 'item').toLowerCase(), { lower: true }),
                        amount: 1,
                        authorId: userId,
                        description: item.subtitle || "",
                        photos: { 
                            create: [{ type: 'product', orgPath: cropWebPath, categoryId: cat.id, llmAnalysis: simulatedLlmAnalysis }] 
                        },
                        attributes: { create: attributesToCreate },
                        locations: containers?.length ? { create: containers.map((c: string) => ({ container: { connect: { inventoryId_name: { inventoryId, name: c } } } })) } : undefined,
                        timelineNotes: noteId ? { connect: [{ id: noteId }] } : undefined,
                        tags: tagIds.length > 0 ? { connect: tagIds } : undefined
                    },
                    include: { photos: true }
                });

                // Hand off to the heavy background ML processor to generate thumbnails, remove backgrounds, etc.
                processItemPhotosBackground(createdItem).catch(e => console.error(e));
            }
        } catch (e) {
            console.error("Bulk processing failed:", e);
        } finally {
            taskManager.end(taskId);
        }
    });

    return json({ success: true });
};