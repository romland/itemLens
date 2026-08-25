/*
Doc: https://kit.svelte.dev/docs/routing#server
*/
import { db } from '$lib/server/database';
import type { Prisma } from '@prisma/client';
import { flagDuplicatesInList } from '$lib/server/matcher';

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
    const count = Math.min( Number(url.searchParams.get('c') ?? '12'), 24);
    const unassigned = url.searchParams.get('unassigned') === 'true';
    const attrKey = url.searchParams.get('attrKey');
    const attrVal = url.searchParams.get('attrVal');
    const sort = url.searchParams.get('sort') || (locals as any).activeSort || 'newest';

    let orderBy: any = [{ id: 'desc' }];
    let isAttention = false;
    switch(sort) {
        case 'oldest': orderBy = [{ id: 'asc' }]; break;
        case 'name_asc': orderBy = [{ title: 'asc' }]; break;
        case 'name_desc': orderBy = [{ title: 'desc' }]; break;
        case 'updated': orderBy = [{ updatedAt: 'desc' }]; break;
        case 'dust': orderBy = [{ updatedAt: 'asc' }]; break;
        case 'amount_asc': orderBy = [{ amount: 'asc' }]; break;
        case 'amount_desc': orderBy = [{ amount: 'desc' }]; break;
        case 'attention': orderBy = [{ updatedAt: 'desc' }]; isAttention = true; break;
    }

    const query: Prisma.ItemFindManyArgs = {
        take: Number(count) || 12,
        skip: Math.max(0, (Number(page) || 1) - 1) * (Number(count) || 12),
        orderBy,
        where: {
            inventoryId: locals.activeInventoryId
        },
        include: {
            locations: {
                include: {  
                    container: true,
                }
            },
            photos: { include: { category: true } },
            "tags" : true,
            "documents": true,      // a bit wasteful as I really only need the count()
            attributes: true,
        }
    };

    if(q && q.length > 0) {
        query.where = {
            ...query.where,
            OR: [
                { title: { contains: q }},
                { description: { contains: q }},
                { locations: { some: { container: { name: { contains: q } } } } },
                { photos: { some: { llmAnalysis: { contains: q } } } },
                { photos: { some: { ocr: { contains: q } } } }
            ]
        };
    }

	if (cat && cat.length > 0) {
		query.where = {
			...query.where,
			photos: { some: { category: { name: cat } } }
		};
	}

    if (attrKey && attrVal) {
        query.where = {
            ...query.where,
            attributes: { some: { key: attrKey, value: attrVal } }
        };
    }

    if (unassigned) {
        query.where = {
            ...query.where,
            locations: { none: {} }
        };
    }

    if (isAttention) {
        const attentionFilter = { OR: [{ locations: { none: {} } }, { title: 'New Item' }, { title: '' }] };
        if (query.where?.OR) {
            const existingOr = query.where.OR;
            delete query.where.OR;
            query.where.AND = [ { OR: existingOr }, attentionFilter ];
        } else {
            query.where.AND = [ attentionFilter ];
        }
    }

    const items = await db.item.findMany(query);

    await flagDuplicatesInList(items, locals.activeInventoryId);

    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < count ? 0 : page + 1;

    return new Response(JSON.stringify({ q, items, prevPage, nextPage }));
}
