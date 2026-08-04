import { json } from '@sveltejs/kit';
import { guessProductDetails } from '$lib/server/gemini-classification';
import { db } from '$lib/server/database';

export async function POST({ request }) {
    const { itemId, hint } = await request.json();
    
    // Get the item's first product photo
    const item = await db.item.findUnique({
        where: { id: Number(itemId) },
        include: { photos: true }
    });
    
    const photo = item?.photos.find(p => p.type === 'product');
    
    if (!photo) {
        return json({ error: "No product photo found to analyze." }, { status: 400 });
    }

    try {
        const result = await guessProductDetails(`static${photo.orgPath}`, hint);
        return json(result);
    } catch (e: any) {
        console.error("AI Refine Error:", e);
        return json({ error: "Failed to process image with AI." }, { status: 500 });
    }
}