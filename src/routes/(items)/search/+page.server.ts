import type { PageServerLoad } from "./$types";
import { db } from '$lib/server/database';

export const load = (async ({ locals, url }) => {
    const q = String(url.searchParams.get('q')).trim();
    const page = Number(url.searchParams.get('page') ?? '1');

    const items = await db.item.findMany({
        where: {
            OR: [
                { title: { contains: q }},
                { description: { contains: q }}
            ],
            AND: [
                { authorId: locals.user.id },
            ]
        },
        take: 10,
        skip: page == 1 ? 0 : (page - 1) * 10,
        orderBy: [{ id: 'desc'}]
    });

    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < 10 ? 0 : page + 1;

    return { q, items, prevPage, nextPage };
}) satisfies PageServerLoad;
