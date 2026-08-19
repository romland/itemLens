/*
Doc: https://kit.svelte.dev/docs/routing#server
*/
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import { marked } from "marked";
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { json } from '@sveltejs/kit';
import slugify from 'slugify';
import { extractBoundingBox } from '$lib/server/imageProcessor';
import { logActivity } from '$lib/server/logger';
import { taskManager } from '$lib/server/taskManager';

/*
TODO SECURITY: NEED TO IMPLEMENT AUTHORIZATION HERE (HOW IS IT DONE ELSEWHERE?)
*/

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, setHeaders, locals }) {
	setHeaders({
		'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
	});

    const parsedId = Number(url.searchParams.get('id'));
    if (isNaN(parsedId) || parsedId === 0) error(400, 'Invalid ID');

    const item = await db.item.findFirst({
        where: {
            AND: [
                // { author: { id: locals.user.id } },
                // { id: Number(url.searchParams.get('id')) },
                { id: parsedId },
                { inventoryId: locals.activeInventoryId }
            ]
        },
        include: {
            inventory: true,
            photos: true,
            documents: true,
            tags: true,
            attributes: true,
            usage: true,
            locations: {
                include: {
                    container: {
                        include : { parent : true }
                    },
                }
            },
            logs: { orderBy: { createdAt: 'desc' } }
        }
    });

    const window = new JSDOM('').window;
    const purify = DOMPurify(window);

    const ret = {
        ...item,
        contentToHtml: purify.sanitize(await marked.parse(item.description!, {gfm:true,breaks:true}))
    }

	return new Response(JSON.stringify(ret));
}

export async function POST({ request, locals }) {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const title = (formData.get('title') as string) || 'Untitled Item';
    const description = (formData.get('description') as string) || '';
    const draftPath = formData.get('draftPath') as string;
    const boxStr = formData.get('box') as string;
    const container = formData.get('container') as string;
    const extractedAttributesStr = formData.get('extractedAttributes') as string;

    let finalPathForProduct = draftPath;

    if (draftPath && boxStr) {
        try {
            const box = JSON.parse(boxStr);
            const localDraftPath = `static${draftPath}`;
            const extracted = await extractBoundingBox(localDraftPath, box, title);
            if (extracted) finalPathForProduct = extracted;
        } catch (e) {
            console.error("Failed to crop image from box", e);
        }
    }

    let noteId = null;
    if (draftPath) {
        let note = await db.timelineNote.findFirst({
            where: { inventoryId: locals.activeInventoryId, category: 'archive', photos: { some: { orgPath: draftPath } } }
        });
        if (!note) {
            note = await db.timelineNote.create({
                data: { content: `Comparison Scan Source`, category: 'archive', inventoryId: locals.activeInventoryId, authorId: locals.user.id, photos: { create: [{ type: 'information', orgPath: draftPath }] } }
            });
        }
        noteId = note.id;
    }

    const { createItemEntity } = await import('$lib/server/services');
    const item = await createItemEntity({
        title,
        description,
        inventoryId: locals.activeInventoryId,
        userId: locals.user.id,
        containers: container ? [container] : [],
        extractedAttributes: extractedAttributesStr,
        photos: draftPath ? [{ type: 'product', orgPath: finalPathForProduct }] : [],
        timelineNoteId: noteId
    });


    await logActivity(item.id, 'Creation', `Item added from Quick Action (Compare Lens)`, 'success');

    if (draftPath) {
        await logActivity(item.id, 'Extraction', `Cropped bounding box out of original scan`, 'info');
    }

    return json({ success: true, id: item.id });
}

export async function PATCH({ request, locals }) {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    const { itemId, newContainer } = await request.json();
    
    await db.item.update({
        where: { id: itemId, inventoryId: locals.activeInventoryId },
        data: {
            locations: {
                deleteMany: {},
                create: [{ container: { connect: { inventoryId_name: { inventoryId: locals.activeInventoryId, name: newContainer } } } }]
            }
        }
    });
    return json({ success: true });
}
