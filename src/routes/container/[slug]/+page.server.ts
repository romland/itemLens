import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { error } from "@sveltejs/kit";

export const load = (async ({ locals, params }) => {
    console.log(params)
    const item = await db.container.findFirst({
        where: {
            AND: [
                // { author: { id: locals.user.id } },
                { name: params.slug },
                { inventoryId: locals.activeInventoryId }
            ]
        },
        include: {
            children : {
                select : {
                    id: true,
                    name : true,
                    parentId : true,
                    description : true,
                }
            },
        }
    });

    if (!item) {
        error(404, 'Container not found.');
    }

    // Gather this container + all its child trays to fetch their items
    const containerIds = [item.id, ...item.children.map(c => c.id)];

    const items = await db.item.findMany({
        where: {
            inventoryId: locals.activeInventoryId,
            locations: {
                some: {
                    containerId: { in: containerIds }
                }
            }
        },
        include: {
            photos: true,
            tags: true,
            documents: true,
            locations: { include: { container: true } }
        },
        orderBy: { id: 'desc' }
    });

    return {
        item: item,
        items: items
    };
}) satisfies PageServerLoad;
