import { json } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import { logActivity } from '$lib/server/logger';

export async function POST({ request, locals }) {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

    const { photoId, itemId } = await request.json();
    if (!photoId || !itemId) return json({ error: 'Missing parameters' }, { status: 400 });

    const item = await db.item.findFirst({ where: { id: itemId, inventoryId: locals.activeInventoryId } });
    if (!item) return json({ error: 'Item not found in current collection' }, { status: 404 });

    await db.photo.updateMany({
        where: { itemId },
        data: { isPrimary: false }
    });

    await db.photo.update({
        where: { id: photoId },
        data: { isPrimary: true }
    });

    await logActivity(itemId, 'Photo', `Updated key photo`, 'info');

    return json({ success: true });
}