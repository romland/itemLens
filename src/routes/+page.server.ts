import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';

export const load = (async ({ locals, url, fetch }) => {
    const unassignedCount = await db.item.count({
        where: {
            inventoryId: locals.activeInventoryId,
            locations: { none: {} }
        }
    });

    const apiUrl = new URL('/api/items', url.origin);
    url.searchParams.forEach((val, key) => apiUrl.searchParams.append(key, val));
    if (!apiUrl.searchParams.has('c')) apiUrl.searchParams.set('c', '12');

    const res = await fetch(apiUrl.toString());
    const data = await res.json();

    return { items: data.items, prevPage: data.prevPage, nextPage: data.nextPage, unassignedCount };
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