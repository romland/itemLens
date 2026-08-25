import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { error } from "@sveltejs/kit";

export const load = (async ({ locals, params, url, fetch }) => {
    const item = await db.container.findFirst({
        where: {
            AND: [
                // { author: { id: locals.user.id } },
                { name: params.slug },
                { inventoryId: locals.activeInventoryId }
            ]
        },
        include: {
            children : {
                select : {
                    id: true,
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

    const apiUrl = new URL('/api/items', url.origin);
    url.searchParams.forEach((val, key) => apiUrl.searchParams.append(key, val));
    apiUrl.searchParams.set('container', item.name); // Force the API to filter by this container

    const res = await fetch(apiUrl.toString());
    const data = await res.json();

    return {
        item: item,
        items: data.items,
        prevPage: data.prevPage,
        nextPage: data.nextPage
    };
}) satisfies PageServerLoad;
