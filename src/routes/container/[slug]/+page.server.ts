import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { error } from "@sveltejs/kit";

export const load = (async ({ locals, params }) => {
    console.log(params)
    const item = await db.container.findFirst({
        where: {
            AND: [
                // { author: { id: locals.user.id } },
                { name: params.slug.replace("-", " ") }
            ]
        },
        include: {
            children : {
                select : {
                    name : true,
                    parentId : true,
                    description : true,
                }
            },
        }
    });

    if (!item) {
        error(404, 'Container not found.');
    }

    return {
        item: item
    };
}) satisfies PageServerLoad;
