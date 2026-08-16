import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';
import { ioQueue } from '$lib/server/queue/index';
import slugify from 'slugify';
import { processItemPhotosBackground } from '$lib/server/photouploads';
import { taskManager } from '$lib/server/taskManager';
import { getTagIds } from '$lib/server/services';
import { extractBoundingBox } from '$lib/server/imageProcessor';

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

            const localDraftPath = `static${draftPath}`;
            
            // 3. Process approved items
            for (const item of items) {
                let cropWebPath = draftPath;
                if (item.box) {
                    const extracted = await extractBoundingBox(localDraftPath, item.box, item.title || 'item');
                    if (extracted) cropWebPath = extracted;
                }

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