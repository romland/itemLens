import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { fail, redirect } from "@sveltejs/kit";

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
        return fail(400, {
            error: true,
            message: '<strong>Container</strong> not found.'
        });
    }

    return {
        item: item
    };
}) satisfies PageServerLoad;
