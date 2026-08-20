import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI, Type } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';
import { getSafeFilename, processDraftPhotoBackground } from '$lib/server/photouploads';
import fs from 'fs';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import { apiQueue } from '$lib/server/queue/index';
import { db } from '$lib/server/database';
import sharp from 'sharp';
import { withRetry } from '$lib/server/retry';
import { computeMatch, normalizeStr, isUseless } from '$lib/server/matcher';
import { getActiveSchema } from '$lib/server/ontology';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const data = await request.formData();
        const file = data.get('file') as File;

        if (!file || !file.size) {
            return json({ error: 'No file provided' }, { status: 400 });
        }

		// Ensure EXIF orientation is permanently baked into the pixel data 
		// so Gemini's bounding boxes match the UI rendering exactly.
		let rawBuffer = Buffer.from(await file.arrayBuffer());
        const buffer = await sharp(rawBuffer).rotate().withMetadata().webp({ quality: 85 }).toBuffer();
		
        const filename = getSafeFilename(file.name, 'collection') + '.webp';
        const localPath = `${uploadsDiskFolder}/${filename}`;
        const webPath = `${uploadsWebFolder}/${filename}`;

        fs.writeFileSync(localPath, buffer);
        processDraftPhotoBackground(webPath, 'information', locals.activeInventoryId).catch(e => console.error(e));

        const note = await db.timelineNote.create({
            data: {
                content: "Collection capture (Pending triage)",
                authorId: locals.user.id,
                inventoryId: locals.activeInventoryId,
                category: 'archive',
                photos: { create: [{ type: 'information', orgPath: webPath }] }
            }
        });

		let promptText = `Identify the collection of items in this image (e.g. Books, CDs, Vinyl, Board Games).
FIRST, count the total number of FULLY VISIBLE individual items.
THEN, extract EVERY fully visible item on the shelf.

CRITICAL EXTRACTION RULES:
1. NO PARTIALS: Completely ignore items cut off by the edge of the image. Do not count them, do not extract them.
2. UNKNOWN BUT PRESENT: If an item is fully visible but turned backward, unreadable, or blurry, you MUST still extract it. Use a generic title (e.g., 'Unknown CD') and set low_confidence to true.
3. NO DUPLICATES: Draw exactly one bounding box per physical item.

For each item:
- title: The actual name of the work itself (e.g., Book Title, Album Name, Movie Title, Product Name). NEVER put the author or artist here. If unreadable, use a placeholder (e.g., 'Unknown CD').
- subtitle: The creator (e.g., Author, Band/Artist, Maker, Brand). NEVER put the main work title here.
- category: A STRICTLY SINGULAR, specific retail-style sub-category (e.g. 't-shirt', 'mug', 'wrench'). NEVER use plural. NEVER use broad macro-categories like 'clothing', 'media', or 'electronics'.
- box: The spatial bounding box of the item's spine or front, as [ymin, xmin, ymax, xmax] normalized from 0 to 1000.
- low_confidence: Set to true if the text is blurry, occluded, or hard to read.
`;

        const activeSchema = await getActiveSchema(locals.activeInventoryId, null, true);
        const visibleSchema = activeSchema.filter((s: any) => s.extractionMethod !== 'HUMAN_REQUIRED');
        let schemaProps: any = {};
        if (visibleSchema.length > 0) {
            promptText += `\n- extractedAttributes: Extract these specific fields if visible. Use provided enums where applicable. If entirely hidden, omit it.\n SCHEMA: ${JSON.stringify(visibleSchema.map((s: any) => ({ name: s.name, type: s.type, options: s.options })))}\n`;
            visibleSchema.forEach((s: any) => {
                schemaProps[s.name] = { type: s.type === 'number' ? Type.NUMBER : Type.STRING, description: s.uiLabel };
            });
        }

		const hint = data.get('hint') as string;
		if (hint && hint.trim()) {
			promptText += `\n\nUSER HINT: The user noted this collection is: "${hint.trim()}". Prioritize identifying the items within this context.`;
		}

        const base64Data = buffer.toString('base64');
        const ext = file.name.split('.').pop()?.toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'webp') mimeType = 'image/webp';

        const aiResponse = await apiQueue.add(
            async () => {
                const res = await withRetry(() => ai.models.generateContent({
                            model: 'gemini-3.1-flash-lite',
                            contents: [
                                { role: 'user', parts: [{ text: promptText }, { inlineData: { mimeType, data: base64Data } }] }
                            ],
                            config: {
                                responseMimeType: 'application/json',
                                responseSchema: {
                                    type: Type.OBJECT,
                                    properties: {
                                        totalVisibleCount: { type: Type.INTEGER, description: 'The total number of items you counted' },
                                        collectionType: { type: Type.STRING },
                                        items: {
                                            type: Type.ARRAY,
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    title: { type: Type.STRING },
                                                    subtitle: { type: Type.STRING },
                                                    category: { type: Type.STRING },
                                                    ...(visibleSchema.length > 0 ? { extractedAttributes: { type: Type.OBJECT, properties: schemaProps } } : {}),
                                                    box: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: '[ymin, xmin, ymax, xmax] normalized 0-1000' },
                                                    low_confidence: { type: Type.BOOLEAN }
                                                },
                                                required: ['title', 'subtitle', 'category', 'box', 'low_confidence']
                                            }
                                        }
                                    },
                                    required: ['totalVisibleCount', 'collectionType', 'items']
                                }
                            }
                        }), 3, 2000, 'Collection Analysis (Vision)', { itemId: 0, prompt: promptText }); 
                
                return JSON.parse(res.text!);
            },
            { targetType: 'global', targetId: 0, description: 'Analyzing collection items with Vision Model' }
        );

        const dbItems = await db.item.findMany({
            where: { inventoryId: locals.activeInventoryId },
            include: { attributes: true, locations: { include: { container: true } }, photos: true }
        });
        const categories = await db.category.findMany({ where: { inventoryId: locals.activeInventoryId } });
        const vault = await db.inventory.findUnique({ where: { id: locals.activeInventoryId } });
        const defaultStrategy = vault?.duplicateStrategy || 'PROMPT';

        for (const item of aiResponse.items) {
            item.isDuplicate = false;
            item.duplicateStrategy = defaultStrategy;

            if (item.category) {
                const cat = categories.find((c: any) => c.name.toLowerCase() === item.category.toLowerCase());
                if (cat && cat.duplicateStrategy) item.duplicateStrategy = cat.duplicateStrategy;
            }

            for (const dbItem of dbItems) {
                const match = computeMatch(item.extractedAttributes || {}, item.title || '', '', dbItem, activeSchema, item.category);
                if (match.isMatch) {
                    item.isDuplicate = true;
                    const sharedAttrs: any[] = [];
                    if (item.extractedAttributes) {
                        const schemaKeys = new Set(activeSchema.map((s: any) => s.name));
                        for (const [k, v] of Object.entries(item.extractedAttributes)) {
                            if (!schemaKeys.has(k)) continue;
                            const dbVal = dbItem.attributes.find((a: any) => a.key === k)?.value;
                            if (dbVal && !isUseless(v) && normalizeStr(String(v)) === normalizeStr(dbVal)) {
                                sharedAttrs.push({ key: k, value: String(v) });
                            }
                        }
                    }
                    item.duplicateItemDetails = {
                        id: dbItem.id, slug: dbItem.slug, title: dbItem.title, createdAt: dbItem.createdAt, categoryName: dbItem.photos?.[0]?.category?.name || 'Uncategorized',
                        thumbPath: dbItem.photos?.[0]?.thumbPath || dbItem.photos?.[0]?.orgPath || null,
                        locationName: dbItem.locations?.[0]?.container?.name || 'Unassigned',
                        sharedAttributes: sharedAttrs
                    };
                    break;
                }
            }
        }

        return json({ success: true, draftPath: webPath, noteId: note.id, totalVisibleCount: aiResponse.totalVisibleCount, collectionType: aiResponse.collectionType, items: aiResponse.items });
    } catch (e) {
        console.error("Collection analysis error:", e);
        const err = e as any;
        const is503 = err?.status === 503 || err?.message?.includes('503') || err?.message?.includes('demand');
        const errorMessage = is503 
            ? "Vision service is currently experiencing high demand. Please wait a few moments and try again." 
            : "An unexpected error occurred while analyzing the image. Please try another photo.";

        return json({ success: false, error: errorMessage }, { status: is503 ? 503 : 500 });
    }
};