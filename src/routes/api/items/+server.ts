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

    // Advanced Search/Bulk Filters
    const tag = String(url.searchParams.get('tag') || "").trim();
    const container = String(url.searchParams.get('container') || "").trim();
    const titleStr = String(url.searchParams.get('title') || "").trim();
    const descStr = String(url.searchParams.get('desc') || "").trim();
    const docStr = String(url.searchParams.get('doc') || "").trim();
    const reasonStr = String(url.searchParams.get('reason') || "").trim();
    const minAmount = url.searchParams.get('minAmount');
    const maxAmount = url.searchParams.get('maxAmount');
    const duplicateStatus = url.searchParams.get('duplicateStatus');
    const colorMix = url.searchParams.get('color');

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
        if (cat === '_uncategorized') {
            // Finds items that DO NOT have ANY photo with a valid category
            query.where = { ...query.where, photos: { none: { categoryId: { not: null } } } };
        } else {
            query.where = { ...query.where, photos: { some: { category: { name: cat } } } };
        }
	}

    if (tag && tag.length > 0) {
        query.where = { ...query.where, tags: { some: { OR: [{ name: tag }, { slug: tag }] } } };
    }

    if (container && container.length > 0) {
        const cList = container.split(',');
        query.where = { ...query.where, locations: { some: { container: { name: { in: cList } } } } };
    }

    if (unassigned) {
        query.where = { ...query.where, locations: { none: {} } };
    }

    if (titleStr) query.where = { ...query.where, title: { contains: titleStr } };
    if (descStr) query.where = { ...query.where, description: { contains: descStr } };
    if (reasonStr) query.where = { ...query.where, reason: { contains: reasonStr } };
    
    if (docStr) {
        query.where = { ...query.where, documents: { some: { OR: [ { title: { contains: docStr } }, { extracts: { contains: docStr } }, { summary: { contains: docStr } } ] } } };
    }

    if (duplicateStatus) {
        query.where = { ...query.where, duplicateStatus };
    }

    if (colorMix && colorMix !== '[]') {
        try {
            const colors = JSON.parse(colorMix).map((c: any) => c.name || c.color);
            if (colors.length > 0) {
                query.where = { ...query.where, attributes: { some: { key: 'color_mix', AND: colors.map((c: string) => ({ value: { contains: `"${c}"` } })) } } };
            }
        } catch (e) {}
    }

    if (minAmount || maxAmount) {
        query.where = { ...query.where, amount: {} };
        if (minAmount) (query.where as any).amount.gte = Number(minAmount);
        if (maxAmount) (query.where as any).amount.lte = Number(maxAmount);
    }

    if (attrKey && attrVal) {
        query.where = { ...query.where, attributes: { some: { key: attrKey, value: attrVal } } };
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

    const [items, totalCount] = await Promise.all([
        db.item.findMany(query),
        db.item.count({ where: query.where })
    ]);

    await flagDuplicatesInList(items, locals.activeInventoryId);

    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < count ? 0 : page + 1;

    return new Response(JSON.stringify({ q, items, totalCount, prevPage, nextPage }));
}
