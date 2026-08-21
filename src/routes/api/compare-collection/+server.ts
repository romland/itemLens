import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import { getSafeFilename } from '$lib/server/photouploads';
import fs from 'fs';
import sharp from 'sharp';
import { taskManager } from '$lib/server/taskManager';
import { apiQueue } from '$lib/server/queue/index';
import { getActiveSchema } from '$lib/server/ontology';
import { computeMatch, normalizeStr, findBestMatch, computeIdfMap } from '$lib/server/matcher';
import { withRetry } from '$lib/server/retry';
import { tokenizeAndStem } from '$lib/server/nlp';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const taskId = taskManager.start('global', 0, 'Analyzing comparison image');

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const scopeType = (formData.get('scopeType') as string) || 'all'; // 'all' | 'tag' | 'category' | 'container'
        const scopeValue = (formData.get('scopeValue') as string) || '';
        const hint = (formData.get('hint') as string) || '';

        if (!file || file.size === 0) return json({ error: 'No image provided' }, { status: 400 });

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = getSafeFilename('compare-scan') + '.webp';
        const localDiskPath = `${uploadsDiskFolder}/${filename}`;
        const webPath = `${uploadsWebFolder}/${filename}`;

        // Fetch ALL fields in inventory so Gemini can extract category-specific fields dynamically across a broad scan
        const activeSchema = await getActiveSchema(locals.activeInventoryId, null, true);

        await sharp(buffer).rotate().withMetadata().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 85 }).toFile(localDiskPath);
        const base64Data = fs.readFileSync(localDiskPath).toString('base64');

        let prompt = `Analyze this image containing a collection of physical items (such as books, CDs, DVDs, grocery cans, or tools). 
CRITICAL: You must extract EVERY SINGLE INDIVIDUAL physical item as its own separate entry. DO NOT group multiple adjacent items together into one bounding box. Even if two items are identical, they must each get their own distinct, tight bounding box.

CRITICAL GROUNDING RULES:
- YOU ARE A STRICT VISUAL EXTRACTOR.
- FIRST, count the total number of FULLY VISIBLE individual items.
- THEN, extract data for EVERY fully visible item.
- NO PARTIALS: Completely ignore items cut off by the edge of the image. Do not count or extract them.
- UNKNOWN BUT PRESENT: If a fully visible item is backwards, blurry, or unreadable, you MUST still extract it using a generic title (e.g., 'Unknown').
- NO DUPLICATES: Draw exactly one box per physical item.
- IF YOU CANNOT SEE IT PRINTED OR PHYSICALLY PRESENT IN THE IMAGE, DO NOT INFER IT.
- NEVER generate plot summaries, reviews, or historical facts.
- DICTIONARY ENFORCEMENT: Check the SCHEMA DICTIONARY. Output exact keys for 'global' and your chosen 'category' into 'extractedAttributes'. Output null if obscured.

Return a JSON object with:
- "totalVisibleCount": (integer) the number of items you counted.
- "detectedItems": array of objects, each containing:
- "title": (string) The actual name of the work (Book Title, Album Name, Movie Title). NEVER the author/artist.
- "subtitle": (string, optional) ONLY the creator (Author, Artist, Brand, Maker) or edition physically printed on the item. NEVER the main title. DO NOT write descriptions.
- "category": (string) A STRICTLY SINGULAR, specific retail-style sub-category (e.g. 't-shirt', 'mug', 'wrench'). NEVER use plural. NEVER use broad macro-categories like 'clothing', 'media', or 'electronics'.
  - "extractedAttributes": (object) Key-value pairs matching the SCHEMA DICTIONARY.
  - "rawText": (string) literally every word you can read on the item, space separated. Do not format it.
  - "box": (array of numbers) tight bounding box [ymin, xmin, ymax, xmax] normalized to 0-1000 around the SINGLE individual item.`;

        const visibleSchema = activeSchema.filter((s: any) => s.extractionMethod !== 'HUMAN_REQUIRED');
        if (visibleSchema.length > 0) {
            const dict: any = {};
            visibleSchema.forEach((s: any) => { const cat = s.categoryId ? s.categoryId.toString() : 'global'; if (!dict[cat]) dict[cat] = {}; dict[cat][s.name] = s.options || s.type; });
            prompt += `\nSCHEMA DICTIONARY:\n${JSON.stringify(dict)}\n`;
        }

        if (hint.trim()) {
            prompt += `\nUser hint for context: "${hint.trim()}". Use this to improve detection accuracy.`;
        }

        const response = await apiQueue.add(
            () => withRetry(() => ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }, { inlineData: { mimeType: 'image/webp', data: base64Data } }]
                }
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'object',
                    properties: {
                        totalVisibleCount: { type: 'integer' },
                        detectedItems: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    title: { type: 'string' },
                                    subtitle: { type: 'string' },
                                    category: { type: 'string' },
                                    extractedAttributes: { type: 'object' },
                                    rawText: { type: 'string' },
                                    box: {
                                        type: 'array',
                                        items: { type: 'number' },
                                        description: 'Bounding box [ymin, xmin, ymax, xmax] normalized to 0-1000'
                                    }
                                },
                                required: ['title', 'box']
                            }
                        }
                    },
                    required: ['totalVisibleCount', 'detectedItems']
                }
            }
            }), 3, 2000, 'Comparison Scan', { prompt }),
            { targetType: 'global', targetId: 0, description: 'Matching physical items against inventory database' }
        );

        const parsed = JSON.parse(response.text || '{"detectedItems":[], "totalVisibleCount": 0}');
        const detected = parsed.detectedItems || [];
        const totalVisibleCount = parsed.totalVisibleCount || detected.length;

        // Always fetch ALL items in the inventory so we can identify items from other locations
        const dbItems = await db.item.findMany({
            where: { inventoryId: locals.activeInventoryId },
            include: { locations: { include: { container: true } }, tags: true, attributes: true }
        });

        const inCollection: any[] = [];
        const newToYou: any[] = [];
        const matchedDbItemIds = new Set<number>();
        const idUsage = new Map<number, number>();
        const idfMap = computeIdfMap(dbItems);

        for (const item of detected) {
            let bestMatch = null;
            let highestScore = -999;

            for (const dbItem of dbItems) {
                const used = idUsage.get(dbItem.id) || 0;
                const available = dbItem.amount || 1;
                if (used >= available) continue; // Fully consumed by other boxes in photo

            const scanCtx = {
                tokens: tokenizeAndStem([item.title, item.subtitle, item.rawText]),
                colorMix: item.extractedAttributes?.color_mix,
                title: item.title || '',
                description: item.subtitle || '',
                rawText: item.rawText || '',
                category: item.category,
                prominentTextOrGraphic: item.extractedAttributes?.prominent_text_or_graphic,
                distinctiveWear: item.extractedAttributes?.distinctive_blemishes_or_wear
            };
            const m = computeMatch(scanCtx, dbItem, idfMap);
                if (m.isMatch && m.score > highestScore) {
                    highestScore = m.score;
                    bestMatch = dbItem;
                }
            }

            const match = bestMatch;

            if (match) {
                idUsage.set(match.id, (idUsage.get(match.id) || 0) + 1);
                matchedDbItemIds.add(match.id);

                const matchNorm = normalizeStr(match.title);
                const dbTotalAmount = dbItems.filter(i => normalizeStr(i.title) === matchNorm).reduce((sum, i) => sum + (i.amount || 1), 0);

                inCollection.push({ ...item, matchedItem: { id: match.id, title: match.title, slug: match.slug, amount: match.amount, dbTotalAmount, locationName: match.locations?.[0]?.container?.name || null, thumbPath: match.photos?.[0]?.thumbPath || match.photos?.[0]?.orgPath || null, categoryName: match.photos?.[0]?.category?.name || 'Uncategorized' } });
            } else {
                newToYou.push(item);
            }
        }

        const missingFromScope = (scopeType !== 'all' ? dbItems.filter(i => {
            const used = idUsage.get(i.id) || 0;
            const available = i.amount || 1;
            if (used >= available) return false; // Not missing!

            if (scopeType === 'tag' && scopeValue) return i.tags.some(t => t.slug === scopeValue.toLowerCase().replace(/ /g, '-'));
            if (scopeType === 'category' && scopeValue) return i.photos?.some(p => p.category?.name === scopeValue);
            if (scopeType === 'container' && scopeValue) return i.locations.some(l => l.container.name === scopeValue);
            return false;
        }) : []).map(i => ({ id: i.id, title: i.title, slug: i.slug, amount: i.amount, locationName: i.locations?.[0]?.container?.name || null, thumbPath: i.photos?.[0]?.thumbPath || i.photos?.[0]?.orgPath || null }));

        return json({ success: true, draftPath: webPath, totalDetected: detected.length, totalVisibleCount, inCollection, newToYou, missingFromScope, scopeType, scopeValue, activeSchema });
    } catch (e: any) {
        return json({ error: e.message || 'Comparison scan failed' }, { status: 500 });
    }
    finally {
        taskManager.end(taskId);
    }
};