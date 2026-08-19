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

    return {
        item: {
            ...item,
            // https://marked.js.org/using_advanced
            contentToHtml: purify.sanitize(await marked.parse(item.description!, {gfm:true,breaks:true}))
        },
        activeTasks: taskManager.getTasks('item', item.id),
        categories
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
    }

} satisfies Actions;
