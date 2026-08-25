import { json } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    const containers = await db.container.findMany({
        where: { inventoryId: locals.activeInventoryId, parentId: null },
        include: { children: true },
        orderBy: { name: 'asc' }
    });
    return json(containers);
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    
    try {
        const { name } = await request.json();
        
        if (!name || name.trim() === '') {
            return json({ error: 'Name is required' }, { status: 400 });
        }

        const container = await db.container.create({
            data: {
                name: name.trim(),
                description: "Created via quick-add",
                inventoryId: locals.activeInventoryId
            }
        });
        return json(container);
    } catch (e) {
        return json({ error: 'Failed to create container (it might already exist in this inventory)' }, { status: 400 });
    }
};