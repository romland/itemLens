import { db } from '$lib/server/database';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { savePhotos } from '$lib/server/photouploads';
import { uploadsDiskFolder, uploadsWebFolder, uploadsRemoteSite } from '$lib/server/constants';
import { downloadAndStoreDocuments } from '$lib/server/urldownloader';
import { processFormDocuments } from '$lib/server/services';

export const load = (async ({ locals, url }) => {
    const category = url.searchParams.get('category') || 'all';
    const whereClause: any = { inventoryId: locals.activeInventoryId };

    if (category !== 'all') {
        whereClause.category = category;
    } else {
		whereClause.category = { notIn: ['archive', 'trash'] };
    }

    const notes = await db.timelineNote.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
            photos: true,
            documents: true,
            linkedItems: { select: { id: true, title: true, slug: true } }
        }
    });
    return { notes, currentCategory: category };
}) satisfies PageServerLoad;

export const actions = {
    capture: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { error: true, message: 'Forbidden. Viewer access only.' });

        const formData = await request.formData();
        
        // Handle input from either our UI or the native OS PWA Share Target
        let content = (formData.get('content') || formData.get('text') || '') as string;
        const sharedTitle = formData.get('title') as string;
        const sharedUrl = formData.get('url') as string;
        const lat = parseFloat(formData.get('latitude') as string);
        const lng = parseFloat(formData.get('longitude') as string);
        const category = (formData.get('category') as string) || 'idea';

        const linkedIds = formData.getAll('linkedItemIds[]').map(id => ({ id: Number(id) }));
        const pastedUrls = formData.getAll("pasted_urls[]") as string[];
        const preDocsRaw = formData.getAll("preprocessed_docs[]");
        const pastedDocsRaw = formData.getAll("pasted_documents[]");

        for (const url of pastedUrls) {
            if (!content.includes(url)) content += (content.length > 0 ? "\n" : "") + url;
        }

        const preDocs = preDocsRaw.map(d => JSON.parse(d as string));
        for (const doc of preDocs) {
            if (doc.source && !content.includes(doc.source) && doc.source !== "Pasted Note") {
                content += (content.length > 0 ? "\n" : "") + doc.source;
            }
        }

        if (sharedTitle && !content.includes(sharedTitle)) content = `**${sharedTitle}**\n${content}`;
        if (sharedUrl && !content.includes(sharedUrl)) content += `\n${sharedUrl}`;

        content = content.trim();

        let photosToConnect = [];
        const sharedImages = formData.getAll('images'); // From PWA Share Target
        
        if (sharedImages.length > 0 && sharedImages[0] instanceof File && sharedImages[0].size > 0) {
            // Re-map PWA standard 'images' array to our expected 'file.X' structure
            const mappedData: any = {};
            sharedImages.forEach((img, i) => {
                mappedData[`file.${i}`] = img;
                mappedData[`file.type.${i}`] = 'information';
            });
            const { photos } = await savePhotos(mappedData, uploadsDiskFolder, uploadsWebFolder, 'file.', '');
            photosToConnect = photos;
        } else {
            // Standard internal form submission from TimelineInput
            const dataObj = Object.fromEntries(formData);
            const { photos } = await savePhotos(dataObj, uploadsDiskFolder, uploadsWebFolder, 'file.', '');
            photosToConnect = photos;
        }

        const hasUploadedDocs = Array.from(formData.keys()).some(k => k.startsWith('uploaded_document_file.'));

        if (!content && photosToConnect.length === 0 && linkedIds.length === 0 && preDocsRaw.length === 0 && pastedDocsRaw.length === 0 && !hasUploadedDocs) {
            return fail(400, { error: true, message: "Note cannot be empty." });
        }

        const note = await db.timelineNote.create({
            data: {
                content,
                category,
                latitude: isNaN(lat) ? null : lat,
                longitude: isNaN(lng) ? null : lng,
                authorId: locals.user.id,
                inventoryId: locals.activeInventoryId,
                photos: { create: photosToConnect },
                linkedItems: { connect: linkedIds }
            }
        });

        // Consolidated Document & Paste Saving
        await processFormDocuments(formData, { timelineNoteId: note.id }, uploadsDiskFolder, uploadsWebFolder);

        // Trigger the centralized SingleFile scraper for any URLs found in the text
        const preprocessedSources = new Set(preDocs.map((d: any) => d.source));
        const urls = content.match(/https?:\/\/[^\s]+/g);
        if (urls && urls.length > 0) {
            const uniqueUrls = [...new Set(urls)].filter(u => !preprocessedSources.has(u));
            if (uniqueUrls.length > 0) {
                const dummyData = { urls: uniqueUrls.join('\n') };
                downloadAndStoreDocuments({ timelineNoteId: note.id }, uploadsRemoteSite, dummyData, uploadsDiskFolder, uploadsWebFolder, '').catch(e => console.error(e));            
            }
        }        

        // Return success instead of redirect to prevent back-history generation
        return { success: true };
    },
    
    updateCategory: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { error: true, message: 'Forbidden. Viewer access only.' });

        const data = await request.formData();
        await db.timelineNote.update({ where: { id: Number(data.get('id')), inventoryId: locals.activeInventoryId }, data: { category: data.get('category') as string } });
    },
    delete: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { error: true, message: 'Forbidden. Viewer access only.' });

        const data = await request.formData();
		await db.timelineNote.update({ where: { id: Number(data.get('id')), inventoryId: locals.activeInventoryId }, data: { category: 'trash' } });
    },
    edit: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { error: true, message: 'Forbidden. Viewer access only.' });

        const data = await request.formData();
        await db.timelineNote.update({ where: { id: Number(data.get('id')), inventoryId: locals.activeInventoryId }, data: { content: data.get('content') as string } });
    },
    promote: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { error: true, message: 'Forbidden. Viewer access only.' });

        const data = await request.formData();
        const noteId = Number(data.get('id'));
        
        const note = await db.timelineNote.findUnique({
            where: { id: noteId, inventoryId: locals.activeInventoryId },
            include: { photos: true, documents: true }
        });
        
        if (!note) return fail(404, { error: true, message: "Note not found" });

        // Create a new base Item using the note's text as the initial description
        const newItem = await db.item.create({
            data: {
                title: "Promoted from Notebook",
                slug: "promoted-from-notebook",
                description: note.content || "",
                authorId: note.authorId,
                inventoryId: locals.activeInventoryId
            }
        });

        // Transfer relationships and delete original note
        await db.photo.updateMany({ where: { timelineNoteId: noteId }, data: { timelineNoteId: null, itemId: newItem.id }});
        await db.document.updateMany({ where: { timelineNoteId: noteId }, data: { timelineNoteId: null, itemId: newItem.id }});
        await db.timelineNote.delete({ where: { id: noteId } });

        redirect(303, `/${newItem.id}/edit`);
    }

} satisfies Actions;