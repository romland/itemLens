import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';
import { ioQueue } from '$lib/server/queue/index';
import slugify from 'slugify';
import { taskManager } from '$lib/server/taskManager';
import { getTagIds } from '$lib/server/services';
import { extractBoundingBox } from '$lib/server/imageProcessor';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { draftPath, noteId, containers, items, globalCategory, tagcsv } = await request.json();
    const userId = locals.user.id;
    const inventoryId = locals.activeInventoryId;
    
    const inv = await db.inventory.findUnique({ where: { id: inventoryId }, select: { deepScanCollections: true } });
    const doDeepScan = inv?.deepScanCollections ?? false;

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
                if (item.resolution === 'merge' && item.duplicateItemDetails?.id) {
                    await db.item.update({
                        where: { id: item.duplicateItemDetails.id },
                        data: { amount: { increment: 1 } }
                    });
                    if (containers && containers.length > 0) {
                        for (const cName of containers) {
                            const container = await db.container.findUnique({ where: { inventoryId_name: { inventoryId, name: cName } } });
                            if (container) {
                                await db.itemsInContainer.upsert({
                                    where: { itemId_containerId: { itemId: item.duplicateItemDetails.id, containerId: container.id } },
                                    update: {},
                                    create: { itemId: item.duplicateItemDetails.id, containerId: container.id }
                                });
                            }
                        }
                    }
                    continue; // Skip creating a new row for this item
                }

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

                // Only mock the ML response if Deep Scan is off. If it's on, omitting this forces the background worker to analyze it.
                const simulatedLlmAnalysis = doDeepScan ? undefined : JSON.stringify({
                    photoType: 'product',
                    subCategory: finalCategoryName.toLowerCase(),
                    isNewCategory: false,
                    description: item.title || 'Collection item'
                });

                // Assemble the item
                const { createItemEntity } = await import('$lib/server/services');
                const createdItem = await createItemEntity({
                    title: item.title,
                    description: item.subtitle || "",
                    amount: 1,
                    inventoryId,
                    userId,
                    containers,
                    tagIds,
                    photos: [{ type: 'product', orgPath: cropWebPath, categoryId: cat.id, ...(simulatedLlmAnalysis ? { llmAnalysis: simulatedLlmAnalysis } : {}), showOriginal: true }],
                    attributes: attributesToCreate,
                    extractedAttributes: item.extractedAttributes,
                    timelineNoteId: noteId,
                    duplicateDismissed: item.resolution === 'new'
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