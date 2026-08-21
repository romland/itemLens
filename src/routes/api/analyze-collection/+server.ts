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
import { computeMatch, normalizeStr, isUseless, buildDuplicateDetails, findBestMatch, computeIdfMap } from '$lib/server/matcher';
import { getActiveSchema } from '$lib/server/ontology';
import { BASE_COLORS } from '$lib/server/colors';

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
`;

        const activeSchema = await getActiveSchema(locals.activeInventoryId, null, true);
        const visibleSchema = activeSchema.filter((s: any) => s.extractionMethod !== 'HUMAN_REQUIRED');
        let schemaProps: any = {};
        if (visibleSchema.length > 0) {
            promptText += `\n- extractedAttributes: CRITICAL: Evaluate every field in the schema. If visible, extract it exactly. If hidden or irrelevant, explicitly set the value to null. DO NOT omit keys.\n  SCHEMA: ${JSON.stringify(visibleSchema.map((s: any) => ({ name: s.name, type: s.type, options: s.options })))}\n`;
            visibleSchema.forEach((s: any) => {
                if (s.name === 'color_mix') {
                    schemaProps[s.name] = { 
                        type: Type.ARRAY, 
                        items: { 
                            type: Type.OBJECT, 
                            properties: { color: { type: Type.STRING, enum: s.options || BASE_COLORS }, pct: { type: Type.NUMBER } },
                            required: ['color', 'pct']
                        }, 
                        description: 'Dominant colors and their proportions. e.g. [{"color": "Black", "pct": 0.8}]' 
                    };
                    promptText += `  - ${s.name}: Extract dominant colors as an array of objects. Map complex shades to the closest base color from: ${s.options?.join(', ')}. Pay careful attention to dark shades (e.g. Navy vs Black). ALWAYS output at least one color.\n`;
                } else {
                    schemaProps[s.name] = { type: s.type === 'number' ? Type.NUMBER : Type.STRING, description: s.uiLabel };
                }
            });
        }

        promptText += `\n- box: The spatial bounding box of the item's spine or front, as [ymin, xmin, ymax, xmax] normalized from 0 to 1000.\n- low_confidence: Set to true if the text is blurry, occluded, or hard to read.`;

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
                                                    ...(visibleSchema.length > 0 ? { extractedAttributes: { type: Type.OBJECT, properties: schemaProps, required: visibleSchema.map((s: any) => s.name) } } : {}),
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

        // Map to track how many times a DB item has been consumed by a match in the photo
        const idUsage = new Map<number, number>();
        const idfMap = computeIdfMap(dbItems);

        for (const item of aiResponse.items) {
            item.isDuplicate = false;
            item.duplicateStrategy = defaultStrategy;

            if (item.category) {
                const cat = categories.find((c: any) => c.name.toLowerCase() === item.category.toLowerCase());
                if (cat && cat.duplicateStrategy) item.duplicateStrategy = cat.duplicateStrategy;
            }

            let bestMatch = null;
            let highestScore = -999;

            for (const dbItem of dbItems) {
                // Bug Fix: If we've already matched this physical item up to its total stored quantity, skip it.
                const used = idUsage.get(dbItem.id) || 0;
                const available = dbItem.amount || 1;
                if (used >= available) continue;

                const match = computeMatch(item.extractedAttributes || {}, item.title || '', item.subtitle || '', item.rawText || '', dbItem, activeSchema, idfMap, item.category);

                const dbCat = dbItem.photos?.[0]?.category?.name?.toLowerCase();
                const sCat = item.category?.toLowerCase();
                if (match.isMatch || (dbCat && sCat && dbCat === sCat) || (item.title && dbItem.title && (dbItem.title.toLowerCase().includes(item.title.toLowerCase()) || item.title.toLowerCase().includes(dbItem.title.toLowerCase())))) {
                    if (!item._debugComparisons) item._debugComparisons = [];
                    item._debugComparisons.push({ dbTitle: dbItem.title, score: match.score, trace: match.debugTrace });
                }

                if (match.isMatch && match.score > highestScore) {
                    highestScore = match.score;
                    bestMatch = { dbItem, match };
                }
            }

            if (bestMatch) {
                const { dbItem, match } = bestMatch;
                item.isDuplicate = true;
                idUsage.set(dbItem.id, (idUsage.get(dbItem.id) || 0) + 1);
                item.duplicateItemDetails = buildDuplicateDetails(dbItem, match);
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