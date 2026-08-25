import { json } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import { computeIdfMap, computeMatch, buildScanContextFromDbItem } from '$lib/server/matcher';

export async function POST({ request, locals }) {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    
    const { sourceId, targetId } = await request.json();
    
    const allItems = await db.item.findMany({
        where: { inventoryId: locals.activeInventoryId },
        include: { attributes: true, locations: { include: { container: true } }, photos: { include: { category: true } } }
    });
    
    const sourceItem = allItems.find((i: any) => i.id === sourceId);
    const targetItem = allItems.find((i: any) => i.id === targetId);
    
    if (!sourceItem || !targetItem) return json({ error: 'Item not found' }, { status: 404 });
    
    const idfMap = computeIdfMap(allItems);
    const scanCtx = buildScanContextFromDbItem(sourceItem);
    const match = computeMatch(scanCtx, targetItem, idfMap);
    
    return json({ success: true, match, targetItemTitle: targetItem.title });
}