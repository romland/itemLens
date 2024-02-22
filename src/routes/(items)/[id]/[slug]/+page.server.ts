import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { redirect } from "@sveltejs/kit";
import { marked } from "marked";
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

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
                    container: true,
                }
            },
            attributes: true,
            usage: true,
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
        }
    };
}) satisfies PageServerLoad;
