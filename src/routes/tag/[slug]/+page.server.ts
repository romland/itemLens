import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';

export const load = (async ({ params, url, locals, fetch }) => {
    const tag = await db.tag.findFirst({
        where: { 
            slug: params.slug,
            inventoryId: locals.activeInventoryId
        }
    });

    const apiUrl = new URL('/api/items', url.origin);
    url.searchParams.forEach((val, key) => apiUrl.searchParams.append(key, val));
    if (tag) apiUrl.searchParams.set('tag', tag.name); // Apply the tag filter

    const res = await fetch(apiUrl.toString());
    const data = await res.json();

    return { tag, items: data.items, prevPage: data.prevPage, nextPage: data.nextPage };
}) satisfies PageServerLoad;