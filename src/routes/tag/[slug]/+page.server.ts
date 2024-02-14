import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';

export const load = (async ({ params, url }) => {
    const page = Number(url.searchParams.get('page') ?? '1');

    const tag = await db.tag.findFirst({
        where: { slug: params.slug }
    });

    const items = await db.item.findMany({
        take: 10,
        skip: page == 1 ? 0 : (page - 1) * 10,
        orderBy: [{ id: 'desc'}],
        where: {
            tags: {
                some: {
                    slug: tag?.slug
                }
            }
        },
        include: { photos: true, tags: true }
    });

    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < 10 ? 0 : page + 1;

    return { tag, items, prevPage, nextPage };
}) satisfies PageServerLoad;