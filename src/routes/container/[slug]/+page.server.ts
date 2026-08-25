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

    const includeTrays = url.searchParams.get('includeTrays') === 'true';
    const apiUrl = new URL('/api/items', url.origin);
    url.searchParams.forEach((val, key) => apiUrl.searchParams.append(key, val));
    
    if (includeTrays && item.children.length > 0) {
        apiUrl.searchParams.set('container', [item.name, ...item.children.map((c: any) => c.name)].join(','));
    } else {
        apiUrl.searchParams.set('container', item.name);
    }

    const res = await fetch(apiUrl.toString());
    const data = await res.json();

    const apiPath = `/api/items${apiUrl.search}`;

    return {
        item: item,
        items: data.items,
        includeTrays,
        prevPage: data.prevPage,
        nextPage: data.nextPage,
        apiPath: apiPath + (apiPath.includes('?') ? '&' : '?')
    };
}) satisfies PageServerLoad;
