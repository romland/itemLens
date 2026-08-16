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

    const item = await db.item.create({
        data: {
            title,
            description,
            slug: slugify(title.toLowerCase()),
            inventoryId: locals.activeInventoryId,
            authorId: locals.user.id
        }
    });
    return json({ success: true, id: item.id });
}
