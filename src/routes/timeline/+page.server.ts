import { db } from '$lib/server/database';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { savePhotos } from '$lib/server/photouploads';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import QRUrlDownloader from '$lib/server/urldownloader';
import { getSafeFilename } from '$lib/server/photouploads';
import fs from 'fs';

export const load = (async ({ locals, url }) => {
    const category = url.searchParams.get('category') || 'all';
    const whereClause: any = { authorId: locals.user.id };
    if (category !== 'all') whereClause.category = category;

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
        const formData = await request.formData();
        
        // Handle input from either our UI or the native OS PWA Share Target
        let content = (formData.get('content') || formData.get('text') || '') as string;
        const sharedTitle = formData.get('title') as string;
        const sharedUrl = formData.get('url') as string;
        const lat = parseFloat(formData.get('latitude') as string);
        const lng = parseFloat(formData.get('longitude') as string);

        const linkedIds = formData.getAll('linkedItemIds[]').map(id => ({ id: Number(id) }));
        const pastedUrls = formData.getAll("pasted_urls[]") as string[];
        const preDocsRaw = formData.getAll("preprocessed_docs[]");

        if (pastedUrls.length > 0) {
            content += "\n" + pastedUrls.join("\n");
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
            photosToConnect = await savePhotos(mappedData, uploadsDiskFolder, uploadsWebFolder, 'file.', '');
        } else {
            // Standard internal form submission from TimelineInput
            const dataObj = Object.fromEntries(formData);
            photosToConnect = await savePhotos(dataObj, uploadsDiskFolder, uploadsWebFolder, 'file.', '');
        }

        if (!content && photosToConnect.length === 0 && linkedIds.length === 0 && preDocsRaw.length === 0) {
            return fail(400, { error: true, message: "Note cannot be empty." });
        }

        const note = await db.timelineNote.create({
            data: {
                content,
                latitude: isNaN(lat) ? null : lat,
                longitude: isNaN(lng) ? null : lng,
                authorId: locals.user.id,
                photos: { create: photosToConnect },
                linkedItems: { connect: linkedIds }
            }
        });

        // Pasted text notes (from the global PasteHandler)
        const pastedDocsRaw = formData.getAll("pasted_documents[]");
        const pastedDocs = pastedDocsRaw.map(d => JSON.parse(d as string));
        for (const doc of pastedDocs) {
            if (!content.includes(doc.content)) {
                content += (content.length > 0 ? "\n\n" : "") + doc.content;
            }

            const filename = getSafeFilename(`note-${note.id}`);
            fs.writeFileSync(`${uploadsDiskFolder}/${filename}.txt`, doc.content, { encoding: "utf8" });
            await db.document.create({
                data: { timelineNoteId: note.id, type: "note", title: doc.title, source: "Pasted Note", path: `${uploadsWebFolder}/${filename}.txt`, extracts: JSON.stringify([doc.content]) }
            });
        }

        // Preprocessed Docs (from PasteHandler background fetch)
        for (const doc of preDocs) {
            await db.document.create({
                data: {
                    timelineNoteId: note.id,
                    type: doc.type === 'text' ? 'note' : 'uncategorized',
                    title: doc.title || "",
                    source: doc.source,
                    path: doc.path,
                    extracts: JSON.stringify(doc.extracts || []),
                    summary: doc.summary || null
                }
            });
        }

        // Centralized Background URL Scraping (Fire and forget)
        const urls = content.match(/https?:\/\/[^\s]+/g);
        if (urls && urls.length > 0) {
            Promise.all(urls.map(async (u) => {
                try {
                    const resultStr = await QRUrlDownloader.downloadURL(u);
                    if (!resultStr) return;
                    const result = JSON.parse(resultStr);
                    
                    const docFilename = getSafeFilename(`timeline-${note.id}-doc`);
                    fs.writeFileSync(`${uploadsDiskFolder}/${docFilename}.html`, result.html, { encoding: "utf8" });

                    await db.document.create({
                        data: { title: result.title || u, source: u, path: `${uploadsWebFolder}/${docFilename}.html`, extracts: JSON.stringify(result.extracts || []), timelineNoteId: note.id }
                    });
                        
                    // Deep Scrape: Safely parse HTML for high-value targets only
                    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
                    const keywords = /datasheet|manual|schematic|user guide|instructions|specs|pinout|wiring|\.pdf$/i;
                    let match;
                    let deepLinksFound = 0;
                    
                    while ((match = linkRegex.exec(result.html)) !== null && deepLinksFound < 3) {
                        const href = match[1];
                        const text = match[2].replace(/<[^>]+>/g, '').trim(); // Strip HTML from inner text
                        
                        if (keywords.test(href) || keywords.test(text)) {
                            try {
                                const absUrl = new URL(href, u).href;
                                await db.document.create({
                                    data: { title: `Found: ${text || href.split('/').pop()}`, source: absUrl, path: '', extracts: '[]', timelineNoteId: note.id }
                                });
                                deepLinksFound++;
                            } catch (e) { /* ignore invalid urls */ }
                        }                        
                    }
                } catch (e) { /* silent fail for unreachable urls */ }
            })).catch(e => console.error("URL scrape failed", e));
        }        

        // Return success instead of redirect to prevent back-history generation
        return { success: true };
    },
    
    updateCategory: async ({ request }) => {
        const data = await request.formData();
        await db.timelineNote.update({ where: { id: Number(data.get('id')) }, data: { category: data.get('category') as string } });
    },
    delete: async ({ request }) => {
        const data = await request.formData();
        await db.timelineNote.delete({ where: { id: Number(data.get('id')) } });
    },
    edit: async ({ request }) => {
        const data = await request.formData();
        await db.timelineNote.update({ where: { id: Number(data.get('id')) }, data: { content: data.get('content') as string } });
    }
} satisfies Actions;