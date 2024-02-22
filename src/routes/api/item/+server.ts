/*
Doc: https://kit.svelte.dev/docs/routing#server
*/
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import { marked } from "marked";
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

/*
TODO SECURITY: NEED TO IMPLEMENT AUTHORIZATION HERE (HOW IS IT DONE ELSEWHERE?)
*/

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
    const item = await db.item.findFirst({
        where: {
            AND: [
                // { author: { id: locals.user.id } },
                { id: Number(url.searchParams.get('id')) }
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
                    container: true,
                }
            },
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
