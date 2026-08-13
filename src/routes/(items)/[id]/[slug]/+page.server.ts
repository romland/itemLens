import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/database';
import { redirect, fail } from "@sveltejs/kit";
import { marked } from "marked";
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { savePhotos, processItemPhotosBackground } from '$lib/server/photouploads';
import { processFormDocuments } from '$lib/server/services';
import { downloadAndStoreDocuments } from "$lib/server/urldownloader";
import { uploadsDiskFolder, uploadsRemoteSite, uploadsWebFolder } from '$lib/server/constants';
import { taskManager } from '$lib/server/taskManager';

export const load = (async ({ locals, params }) => {
    const item = await db.item.findFirst({
        where: {
            AND: [
                { author: { id: locals.user.id } },
                { id: Number(params.id) }
            ]
        },
        include: {
            inventory: true,
            photos: true,
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

    return {
        item: {
            ...item,
            // https://marked.js.org/using_advanced
            contentToHtml: purify.sanitize(await marked.parse(item.description!, {gfm:true,breaks:true}))
        },
        activeTasks: taskManager.getTasks('item', item.id)
    };
}) satisfies PageServerLoad;

export const actions = {
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

        const photos = await savePhotos(Object.fromEntries(orgData), uploadsDiskFolder, uploadsWebFolder, "file.", "");

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
