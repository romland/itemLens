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
import { getActiveSchema } from '$lib/server/ontology';
import { computeMatch, normalizeStr, isUseless, buildDuplicateDetails, computeIdfMap } from '$lib/server/matcher';
import { BASE_COLORS } from '$lib/server/colors';
import { tokenizeAndStem } from '$lib/server/nlp';

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
4. DO NOT TRANSLATE: Transcribe titles, text, and brands EXACTLY as printed in the original language.
5. NO HALLUCINATION: If text is unreadable, output null. Do not guess based on probability.
6. DICTIONARY ENFORCEMENT: Check the SCHEMA DICTIONARY. Output exact keys for 'global' and your chosen 'category' into 'extractedAttributes'. Output null if obscured.
7. THE SCALE & MATERIAL FALLACY: A photo has no absolute scale. DO NOT guess sizes, dimensions, or invisible materials unless explicitly printed in visible text. Output null instead of guessing.

For each item:
- title: The actual name of the work itself (e.g., Book Title, Album Name, Movie Title, Product Name). NEVER put the author or artist here. If unreadable, use a placeholder (e.g., 'Unknown CD').
- subtitle: The creator (e.g., Author, Band/Artist, Maker, Brand). NEVER put the main work title here.
- category: A STRICTLY SINGULAR, specific retail-style sub-category (e.g. 't-shirt', 'mug', 'wrench'). NEVER use plural. NEVER use broad macro-categories like 'clothing', 'media', or 'electronics'.
- color_mix: Array of dominant colors with percentages. Map to base colors. e.g. [{"color": "Black", "pct": 0.9}].
- prominent_text_or_graphic: Literal transcription of text or description of core graphic. Null if none.
- distinctive_blemishes_or_wear: Specific damage, fading, or wear (e.g., "hole in knee", "scratched screen"). Null if pristine.
- physical_traits: Array of 5-10 raw, unconstrained descriptive strings describing form, structure, material. e.g., ["cotton", "crew-neck", "short-sleeves", "distressed hem"].
- extractedAttributes: Object containing strict key-value pairs matching the SCHEMA DICTIONARY.
`;

        promptText += `\n- box: The spatial bounding box of the item's spine or front, as [ymin, xmin, ymax, xmax] normalized from 0 to 1000.\n- low_confidence: Set to true if the text is blurry, occluded, or hard to read.`;

        const activeSchema = await getActiveSchema(locals.activeInventoryId, null, true);
        const visibleSchema = activeSchema.filter((s: any) => s.extractionMethod !== 'HUMAN_REQUIRED');
        if (visibleSchema.length > 0) {
            const dict: any = {};
            visibleSchema.forEach((s: any) => {
                const cat = s.categoryId ? s.categoryId.toString() : 'global';
                if (!dict[cat]) dict[cat] = {};
                dict[cat][s.name] = s.options || s.type;
            });
            promptText += `\n\nSCHEMA DICTIONARY:\n${JSON.stringify(dict)}`;
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
                                                    color_mix: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { color: { type: Type.STRING }, pct: { type: Type.NUMBER } } } },
                                                    prominent_text_or_graphic: { type: Type.STRING },
                                                    distinctive_blemishes_or_wear: { type: Type.STRING },
                                                    physical_traits: { type: Type.ARRAY, items: { type: Type.STRING } },
                                                                            extractedAttributes: { type: Type.OBJECT },
                                                    box: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: '[ymin, xmin, ymax, xmax] normalized 0-1000' },
                                                    low_confidence: { type: Type.BOOLEAN }
                                                },
                                                                        required: ['title', 'subtitle', 'category', 'color_mix', 'prominent_text_or_graphic', 'distinctive_blemishes_or_wear', 'physical_traits', 'extractedAttributes', 'box', 'low_confidence']
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

                const scanTokens = tokenizeAndStem([
                    item.title, 
                    item.subtitle, 
                    ...(item.physical_traits || [])
                ]);

                const scanCtx = {
                    tokens: scanTokens,
                    colorMix: item.color_mix,
                    title: item.title || '',
                    description: item.subtitle || '',
                    rawText: item.rawText || '',
                    category: item.category,
                    prominentTextOrGraphic: item.prominent_text_or_graphic,
                    distinctiveWear: item.distinctive_blemishes_or_wear
                };
                const match = computeMatch(scanCtx, dbItem, idfMap);

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