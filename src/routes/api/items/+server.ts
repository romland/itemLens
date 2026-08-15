/*
Doc: https://kit.svelte.dev/docs/routing#server
*/
import { db } from '$lib/server/database';
import type { Prisma } from '@prisma/client';

/*
TODO SECURITY: NEED TO IMPLEMENT AUTHORIZATION HERE (HOW IS IT DONE ELSEWHERE?)
*/

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, setHeaders, locals }) {
    if (!locals.user) return new Response('Unauthorized', { status: 401 });
	setHeaders({
		'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
	});
    const q = String(url.searchParams.get('q') || "").trim();
	const cat = String(url.searchParams.get('category') || "").trim();
    const page = Number(url.searchParams.get('page') ?? '1');
    const count = Math.min( Number(url.searchParams.get('c') ?? '10'), 15);

    const query: Prisma.ItemFindManyArgs = {
        take: count,
        skip: page == 1 ? 0 : (page - 1) * count,
        orderBy: [{ id: 'desc'}],
        where: {
            inventoryId: locals.activeInventoryId
        },
        include: {
            locations: {
                include: {  
                    container: true,
                }
            },
            "photos" : true,
            "tags" : true,
            "documents": true,      // a bit wasteful as I really only need the count()
        }
    };

    if(q && q.length > 0) {
        query.where = {
            ...query.where,
            OR: [
                { title: { contains: q }},
                { description: { contains: q }},
                { locations: { some: { container: { name: { contains: q } } } } }
            ]
        };
    }

	if (cat && cat.length > 0) {
		query.where = {
			...query.where,
			photos: { some: { category: { name: cat } } }
		};
	}

    const items = await db.item.findMany(query);

    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < count ? 0 : page + 1;

    return new Response(JSON.stringify({ q, items, prevPage, nextPage }));
}
