import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';

export const load = (async ({ locals, url }) => {
    const page = Number(url.searchParams.get('page') ?? '1');

    const items = await db.item.findMany({
        where: { author: { id: locals.user.id } },
        take: 10,
        skip: page == 1 ? 0 : (page - 1) * 10,
        orderBy: [{ id: 'desc' }],
        include: {
            locations: {
                include: {  
                    container: true,
                }
            },
            "photos" : true,
            "tags" : true
        }
    });

    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < 10 ? 0 : page + 1;

    return { items: items, prevPage, nextPage };
}) satisfies PageServerLoad;

export const actions = {
    default: async ({ url, cookies }) => {
        const theme = url.searchParams.get('theme');
        const redirectTo = url.searchParams.get('redirectTo');

        if (theme) {
            cookies.set('theme', theme, {
                path: '/',
                maxAge: 60 * 60 * 24 * 365
            });
        }

        redirect(303, redirectTo ?? '/');
    }
} satisfies Actions;