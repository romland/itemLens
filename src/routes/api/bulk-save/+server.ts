import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';
import { ioQueue } from '$lib/server/queue/index';
import sharp from 'sharp';
import slugify from 'slugify';
import fs from 'fs';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import { getSafeFilename } from '$lib/server/photouploads';
import { taskManager } from '$lib/server/taskManager';
import { getTagIds } from '$lib/server/services';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { draftPath, noteId, containers, items, globalCategory, tagcsv } = await request.json();
    const userId = locals.user.id;
    
    // Fire and forget background worker
    ioQueue.add(async () => {
        const taskId = taskManager.start('global', 0, `Saving ${items.length} items from collection...`);
        try {
            // Pre-process tags
            const tagIds = tagcsv ? await getTagIds(tagcsv) : [];

            // 1. Context Preservation: Update the pre-created notebook entry
            const note = await db.timelineNote.update({
                where: { id: noteId },
                data: {
                    content: `Bulk Scan - ${containers?.length ? containers.join(', ') : 'Unassigned Location'}`,
                }
            });

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
                
                const cropFilename = getSafeFilename(item.title || 'item', 'crop');
                const cropLocalPath = `${uploadsDiskFolder}/${cropFilename}.jpg`;
                const cropWebPath = `${uploadsWebFolder}/${cropFilename}.jpg`;
                
                // Extract the physical spine
                await img.clone().extract({ left, top, width: boxW, height: boxH }).jpeg({quality: 90}).toFile(cropLocalPath);

               
                // Build KVP array dynamically
                const attributesToCreate = [];
                if (item.subtitle) attributesToCreate.push({ key: "Subtitle", value: item.subtitle });
                attributesToCreate.push({ key: "Source Scan", value: draftPath });

                // Respect item-level category unless user explicitly typed an override
                const finalCategoryName = globalCategory?.trim() || item.category || 'Unknown';
                
                // Formally categorize it like the standard upload pipeline does
                const { getOrCreateCategory } = await import('$lib/server/categories');
                const cat = await getOrCreateCategory(finalCategoryName);

                // Assemble the item
                await db.item.create({
                    data: {
                        title: item.title,
                        slug: slugify((item.title || 'item').toLowerCase(), { lower: true }),
                        amount: 1,
                        authorId: userId,
                        description: item.subtitle || "",
                        photos: { create: [{ type: 'product', orgPath: cropWebPath, cropPath: cropWebPath, thumbPath: cropWebPath, categoryId: cat.id }] },
                        attributes: { create: attributesToCreate },
                        locations: containers?.length ? { create: containers.map((c: string) => ({ container: { connect: { name: c } } })) } : undefined,
                        timelineNotes: { connect: [{ id: note.id }] },
                        tags: tagIds.length > 0 ? { connect: tagIds } : undefined
                    }
                });
            }
        } catch (e) {
            console.error("Bulk processing failed:", e);
        } finally {
            taskManager.end(taskId);
        }
    });

    return json({ success: true });
};