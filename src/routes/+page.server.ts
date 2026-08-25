import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import { flagDuplicatesInList } from '$lib/server/matcher';

export const load = (async ({ locals, url }) => {
    const page = Number(url.searchParams.get('page') ?? '1');
    const sort = (locals as any).activeSort || 'newest';

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

    const unassignedCount = await db.item.count({
        where: {
            inventoryId: locals.activeInventoryId,
            locations: { none: {} }
        }
    });

    const baseWhere: any = { inventoryId: locals.activeInventoryId };
    if (isAttention) {
        baseWhere.OR = [{ locations: { none: {} } }, { title: 'New Item' }, { title: '' }];
    }

    const items = await db.item.findMany({
        where: baseWhere,
        take: 12,
        skip: page == 1 ? 0 : (page - 1) * 12,
        orderBy,
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
    });

    await flagDuplicatesInList(items, locals.activeInventoryId);

    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < 12 ? 0 : page + 1;

    return { items, prevPage, nextPage, unassignedCount };
}) satisfies PageServerLoad;

export const actions = {
    setTheme: async ({ url, cookies }) => {
        const theme = url.searchParams.get('theme');
        const redirectTo = url.searchParams.get('redirectTo');

        if (theme) {
            cookies.set('theme', theme, {
                path: '/',
                maxAge: 60 * 60 * 24 * 365
            });
        }

        redirect(303, redirectTo ?? '/');
    },
    switchVault: async ({ request, cookies }) => {
        const data = await request.formData();
        const newVaultId = data.get('inventoryId')?.toString();
        
        if (newVaultId) {
            cookies.set('activeInventoryId', newVaultId, { path: '/', maxAge: 60 * 60 * 24 * 365 });
        }
        redirect(303, '/');
    }
} satisfies Actions;