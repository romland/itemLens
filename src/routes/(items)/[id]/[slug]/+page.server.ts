import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { redirect } from "@sveltejs/kit";
import { marked } from "marked";

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
            locations: true,
            attributes: true,
            usage: true,
        }
    });

    if (!item) {
        redirect(302, '/');
    }

    return {
        item: {
            ...item,
            contentToHtml: await marked.parse(item.description!)
        }
    };
}) satisfies PageServerLoad;
