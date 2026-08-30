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
    const count = Math.min( Number(url.searchParams.get('c') ?? '12'), 24);
    const docLimit = Math.min( Number(url.searchParams.get('dc') ?? '50'), 100);
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
    const attrsJson = url.searchParams.get('attrs');

    let orderBy: any = [{ id: 'desc' }];
    switch(sort) {
        case 'oldest': orderBy = [{ id: 'asc' }]; break;
        case 'name_asc': orderBy = [{ title: 'asc' }]; break;
        case 'name_desc': orderBy = [{ title: 'desc' }]; break;
        case 'updated': orderBy = [{ updatedAt: 'desc' }]; break;
        case 'dust': orderBy = [{ updatedAt: 'asc' }]; break;
        case 'amount_asc': orderBy = [{ amount: 'asc' }]; break;
        case 'amount_desc': orderBy = [{ amount: 'desc' }]; break;
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

    let documentResults: any[] = [];

    // Full Text Search for Documents (SQLite FTS5)
    const ftsQuery = q || docStr;
    const safeQ = ftsQuery.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    if (safeQ.length > 0) {
        // Create a prefix search query: "apple" -> '"apple"*'
        const matchQuery = safeQ.split(/\s+/).map(word => `"${word}"*`).join(' AND ');
        try {
            documentResults = await db.$queryRawUnsafe(`
                SELECT d.id, d.title, d.path, d.source, d.itemId, 
                snippet(DocumentIndex, 1, '<mark class="bg-primary/15 text-primary font-semibold px-1 rounded-sm">', '</mark>', '...', 12) as excerpt
                FROM DocumentIndex fts
                JOIN Document d ON d.id = fts.rowid
                LEFT JOIN Item i ON d.itemId = i.id
                LEFT JOIN TimelineNote tn ON d.timelineNoteId = tn.id
                WHERE DocumentIndex MATCH ?
                  AND (i.inventoryId = ? OR tn.inventoryId = ?)
                  AND (tn.category IS NULL OR tn.category != 'trash')
                ORDER BY (
                    -bm25(DocumentIndex, 10.0, 1.0) 
                    + CASE WHEN d.itemId IS NOT NULL THEN 5.0 ELSE 0.0 END
                ) DESC
                LIMIT ?;
            `, matchQuery, locals.activeInventoryId, locals.activeInventoryId, docLimit) as any[];
        } catch (e) { console.error("FTS search failed", e); }
    } else {
        // No search query? Just return the most recent documents for this inventory.
        try {
            documentResults = await db.$queryRawUnsafe(`
                SELECT d.id, d.title, d.path, d.source, d.itemId, 
                '' as excerpt
                FROM Document d
                LEFT JOIN Item i ON d.itemId = i.id
                LEFT JOIN TimelineNote tn ON d.timelineNoteId = tn.id
                WHERE (i.inventoryId = ? OR tn.inventoryId = ?)
                  AND (tn.category IS NULL OR tn.category != 'trash')
                ORDER BY d.createdAt DESC
                LIMIT ?;
            `, locals.activeInventoryId, locals.activeInventoryId, docLimit) as any[];
        } catch(e) { console.error("Recent documents fetch failed", e); }
    }

    // Clean up SQLite FTS JSON artifacts (literal \n, \t, brackets) from the excerpts
    documentResults.forEach(d => {
        if (d.excerpt) {
            d.excerpt = d.excerpt
                .replace(/\\[nrt]/g, ' ')          // Strip literal \n, \r, \t
                .replace(/\\"/g, '"')            // Unescape quotes
                .replace(/^\["?|"?\]$/g, '')     // Remove leading/trailing JSON array brackets
                .replace(/","/g, ' ... ')        // Replace JSON array commas with a nice separator
                .replace(/\s+/g, ' ')            // Collapse multiple spaces
                .trim();
        }
    });

    // Enrich Document Results with Rich Item Data for the UI
    if (documentResults.length > 0) {
        const docItemIds = [...new Set(documentResults.map(d => d.itemId).filter(Boolean))];
        if (docItemIds.length > 0) {
            try {
                const richItems = await db.item.findMany({
                    where: { id: { in: docItemIds } },
                    include: {
                        photos: { include: { category: true } },
                        locations: { include: { container: true } }
                    }
                });
                const itemMap = new Map(richItems.map(i => [i.id, {
                    ...i,
                    locationName: i.locations?.[0]?.container?.name || 'Unassigned',
                    categoryName: i.photos?.[0]?.category?.name || 'No Category'
                }]));
                documentResults.forEach(d => {
                    if (d.itemId) d.item = itemMap.get(d.itemId);
                });
            } catch (e) { console.error("Failed to enrich document items", e); }
        }
    }

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

    if (attrsJson) {
        try {
            const attrs = JSON.parse(attrsJson);
            const andClauses = Object.entries(attrs)
                .filter(([_, v]) => v !== '' && v !== null)
                .map(([k, v]) => ({
                    attributes: { some: { key: k, value: String(v) } }
            }));
            if (andClauses.length > 0) {
                query.where = { ...query.where, AND: [...(query.where.AND as any || []), ...andClauses] };
            }
        } catch(e) { console.error('Failed to parse attrs filter', e); }
    }

    const [rawItems, totalCount] = await Promise.all([
        db.item.findMany(query),
        db.item.count({ where: query.where })
    ]);

    const items = rawItems.map((item: any) => {
        // Strip massive background data not needed for the list view to save network/cache quota
        delete item.semanticTokens;
        if (item.photos) item.photos.forEach((p: any) => { delete p.ocr; delete p.exifData; });
        if (item.documents) item.documents.forEach((d: any) => { delete d.extracts; });

        if (item.duplicateStatus === 'FLAGGED') item.hasDuplicate = true;
        return item;
    });

    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < count ? 0 : page + 1;

    return new Response(JSON.stringify({ q, items, documentResults, totalCount, prevPage, nextPage }));
}
