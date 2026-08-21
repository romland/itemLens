import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/database';
  import { redirect, fail, error } from "@sveltejs/kit";
import { marked } from "marked";
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { savePhotos, processItemPhotosBackground } from '$lib/server/photouploads';
import { processFormDocuments } from '$lib/server/services';
import { downloadAndStoreDocuments } from "$lib/server/urldownloader";
import { uploadsDiskFolder, uploadsRemoteSite, uploadsWebFolder } from '$lib/server/constants';
import { taskManager } from '$lib/server/taskManager';
 import { getActiveSchema } from '$lib/server/ontology';
 import { computeMatch, normalizeStr, isUseless, findBestMatch, buildDuplicateDetails } from '$lib/server/matcher';

export const load = (async ({ locals, params }) => {
      const parsedId = Number(params.id);
      if (isNaN(parsedId)) error(404, 'Not found');

    const item = await db.item.findFirst({
        where: {
            AND: [
                  { id: parsedId },
                { inventoryId: locals.activeInventoryId }
            ]
        },
        include: {
            inventory: true,
			photos: { include: { category: true } },
            documents: true,
            tags: true,
            locations: {
                include: {  
                    container: {
                        include : { parent : true }
                    },
                }
            },
            attributes: true,
            usage: true,
            logs: { orderBy: { createdAt: 'desc' } }
        }
    });

    if (!item) {
        redirect(302, '/');
    }

    const window = new JSDOM('').window;
    const purify = DOMPurify(window);

    const categories = await db.category.findMany({
        where: { inventoryId: locals.activeInventoryId },
        orderBy: { name: 'asc' }
    });

     // Set fetchAll to FALSE: We already know the category, so do not fetch other categories' rules!
     // This strictly prevents "belt buckle" fields from bleeding into "t-shirt" items.
     const activeSchema = await getActiveSchema(locals.activeInventoryId, item.photos[0]?.categoryId, false);
     const existingItems = await db.item.findMany({
         where: { inventoryId: locals.activeInventoryId, id: { not: parsedId } },
         include: { attributes: true, locations: { include: { container: true } }, photos: true }
     });

     const itemAttrs: Record<string, string> = {};
     item.attributes.forEach(a => itemAttrs[a.key] = a.value);

     let duplicateItemDetails = null;
     if (!item.duplicateDismissed) {
         const schemaKeys = new Set(activeSchema.map((s: any) => s.name));
          const bestMatch = findBestMatch(itemAttrs, item.title || '', item.description || '', '', existingItems, activeSchema, item.photos?.[0]?.category?.name);
          if (bestMatch) {
              duplicateItemDetails = buildDuplicateDetails(bestMatch.dbItem, bestMatch.match);
          }
     }

    return {
        item: {
            ...item,
            // https://marked.js.org/using_advanced
            contentToHtml: purify.sanitize(await marked.parse(item.description!, {gfm:true,breaks:true}))
        },
        activeTasks: taskManager.getTasks('item', item.id),
         categories,
         duplicateItemDetails,
         activeSchema
    };
}) satisfies PageServerLoad;

export const actions = {
    changeCategory: async ({ request, locals }) => {
        const data = await request.formData();
        const photoId = Number(data.get('photoId'));
        const categoryName = (data.get('categoryName') as string)?.trim().toLowerCase();
        
        if (photoId && categoryName) {
            const { getOrCreateCategory } = await import('$lib/server/categories');
            const cat = await getOrCreateCategory(categoryName, locals.activeInventoryId);
            await db.photo.update({
                where: { id: photoId },
                data: { categoryId: cat.id }
            });
        }
        return { success: true };
    },

    toggleBackground: async ({ request }) => {
        const data = await request.formData();
        const photoId = Number(data.get('photoId'));
        const showOriginal = data.get('showOriginal') === 'true';
        if (photoId) {
            await db.photo.update({
                where: { id: photoId },
                data: { showOriginal }
            });
        }
        return { success: true };
    },

    addPasted: async ({ request, params }) => {
        const orgData = await request.formData();
        const itemId = Number(params.id);

        const { photos } = await savePhotos(Object.fromEntries(orgData), uploadsDiskFolder, uploadsWebFolder, "file.", "");

        if (photos.length > 0) {
            await db.item.update({
                where: { id: itemId },
                data: { photos: { create: photos } }
            });
            const itemForBg = await db.item.findUnique({ where: { id: itemId }, include: { photos: true } });
            if (itemForBg) processItemPhotosBackground(itemForBg).catch(e => console.error(e));
        }

        const pastedUrls = orgData.getAll("pasted_urls[]") as string[];
        let urls = pastedUrls.join("\n");
        
        await processFormDocuments(orgData, { itemId }, uploadsDiskFolder, uploadsWebFolder);
        
        if (urls.trim()) {
            downloadAndStoreDocuments({ itemId }, uploadsRemoteSite, { urls }, uploadsDiskFolder, uploadsWebFolder, "qr.").catch(e => console.error(e));
        }
        
        return { success: true };
     },

    saveAttributes: async ({ request, locals, params }) => {
        if (!locals.user) return fail(401, { error: 'Unauthorized' });
        const data = await request.formData();
        const attrs = JSON.parse(data.get('attributes') as string);
        const kvps = Object.entries(attrs).filter(([k,v]) => v !== null && v !== '').map(([k,v]) => ({ key: k, value: String(v) }));
        
        const itemId = Number(params.id);
        const existingItem = await db.item.findUnique({ where: { id: itemId }, include: { attributes: true }});
        for (const kvp of kvps) {
            const ext = existingItem?.attributes.find(a => a.key === kvp.key);
            if (ext) {
                await db.kVP.update({ where: { id: ext.id }, data: { value: kvp.value } });
            } else {
                await db.kVP.create({ data: { itemId, key: kvp.key, value: kvp.value } });
            }
        }
        return { success: true };
    },

     mergeDuplicate: async ({ request, locals, params }) => {
         if (!locals.user) return fail(401, { error: 'Unauthorized' });
         const data = await request.formData();
         const targetId = Number(data.get('targetId'));
         const sourceId = Number(params.id);

         if (targetId && sourceId) {
             const sourceItem = await db.item.findUnique({ where: { id: sourceId, inventoryId: locals.activeInventoryId }, include: { locations: true } });
             if (!sourceItem) return fail(404, { message: 'Item not found' });

             const targetItem = await db.item.findUnique({ where: { id: targetId } });
             if (!targetItem) return fail(404, { message: 'Target item not found' });

             await db.item.update({
                 where: { id: targetId },
                 data: { amount: (targetItem.amount || 1) + (sourceItem.amount || 1) }
             });

             await db.photo.updateMany({ where: { itemId: sourceId }, data: { itemId: targetId } });
             await db.document.updateMany({ where: { itemId: sourceId }, data: { itemId: targetId } });

             if (sourceItem.locations) {
                 for (const loc of sourceItem.locations) {
                     await db.itemsInContainer.upsert({
                         where: { itemId_containerId: { itemId: targetId, containerId: loc.containerId } },
                         update: {}, create: { itemId: targetId, containerId: loc.containerId }
                     });
                 }
             }

             await db.item.delete({ where: { id: sourceId } });
             redirect(302, `/${targetId}/${targetItem?.slug || 'view'}`);
         }
     },

     deleteDuplicate: async ({ locals, params }) => {
         if (!locals.user) return fail(401, { error: 'Unauthorized' });
         await db.item.delete({ where: { id: Number(params.id) } });
         redirect(302, '/');
     },

     dismissDuplicate: async ({ locals, params }) => {
         if (!locals.user) return fail(401, { error: 'Unauthorized' });
         await db.item.update({
             where: { id: Number(params.id) },
             data: { duplicateDismissed: true }
         });
         return { success: true };
     }

} satisfies Actions;
