import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';

export const load = (async ({ locals }) => {
    const items = await db.item.findMany({
        where: {
            inventoryId: locals.activeInventoryId,
            locations: { none: {} }
        },
        orderBy: [{ id: 'desc' }],
        include: {
            locations: { include: { container: true } },
            photos: true,
            tags: true,
            documents: true,
        }
    });
    return { items };
}) satisfies PageServerLoad;