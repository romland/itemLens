import { json } from '@sveltejs/kit';
import { guessProductDetails } from '$lib/server/gemini-classification';
import { db } from '$lib/server/database';
import { apiQueue } from '$lib/server/queue/index';

export async function POST({ request, locals }) {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { itemId, hint } = await request.json();
    
    // Get the item's first product photo
    const item = await db.item.findFirst({
        where: { id: Number(itemId), inventoryId: locals.activeInventoryId },
        include: { photos: true }
    });
    
    const photo = item?.photos.find(p => p.type === 'product');
    
    if (!photo) {
        return json({ error: "No product photo found to analyze." }, { status: 400 });
    }

    try {
        const result = await apiQueue.add(
            () => guessProductDetails(`static${photo.orgPath}`, hint),
            { targetType: 'item', targetId: Number(itemId), description: 'Refining product details via LLM' }
        );
        return json(result);
    } catch (e: any) {
        console.error("AI Refine Error:", e);
        return json({ error: "Failed to process image with LLM." }, { status: 500 });
    }
}