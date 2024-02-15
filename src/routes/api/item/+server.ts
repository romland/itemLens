/*
Doc: https://kit.svelte.dev/docs/routing#server
*/
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import { marked } from "marked";

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
            locations: true,
            attributes: true,
            usage: true,
        }
    });

    const ret = {
        ...item,
        contentToHtml: await marked.parse(item?.description!)
    }

	return new Response(JSON.stringify(ret));
}
