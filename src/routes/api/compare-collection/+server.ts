import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import { getSafeFilename } from '$lib/server/photouploads';
import fs from 'fs';
import sharp from 'sharp';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

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

        await sharp(buffer).rotate().withMetadata().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 85 }).toFile(localDiskPath);
        const base64Data = fs.readFileSync(localDiskPath).toString('base64');

        let prompt = `Analyze this image containing a collection of items (such as books, CDs, DVDs, groceries, or tools). Extract every distinct identifiable item. Return a JSON object with:
- "detectedItems": array of objects, each containing:
  - "title": (string) main title or product name
  - "subtitle": (string, optional) author, brand, flavor, artist, or edition
  - "category": (string) simple category
  - "rawText": (string) literally every word you can read on the item, space separated. Do not format it.
  - "box": (array of numbers) bounding box [ymin, xmin, ymax, xmax] normalized to 0-1000`;

        if (hint.trim()) {
            prompt += `\nUser hint for context: "${hint.trim()}". Use this to improve detection accuracy.`;
        }

        const response = await ai.models.generateContent({
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
                        detectedItems: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    title: { type: 'string' },
                                    subtitle: { type: 'string' },
                                    category: { type: 'string' },
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
                    required: ['detectedItems']
                }
            }
        });

        const parsed = JSON.parse(response.text || '{"detectedItems":[]}');
        const detected = parsed.detectedItems || [];

        // Fetch target scope from database to cross-reference
        const itemWhere: any = { inventoryId: locals.activeInventoryId };
        if (scopeType === 'tag' && scopeValue) {
            itemWhere.tags = { some: { slug: scopeValue.toLowerCase().replace(/ /g, '-') } };
        } else if (scopeType === 'category' && scopeValue) {
            itemWhere.photos = { some: { category: { name: scopeValue } } };
        } else if (scopeType === 'container' && scopeValue) {
            itemWhere.locations = { some: { container: { name: scopeValue } } };
        }

        const dbItems = await db.item.findMany({
            where: itemWhere,
            include: { locations: { include: { container: true } }, tags: true }
        });

        const inCollection: any[] = [];
        const newToYou: any[] = [];
        const matchedDbItemIds = new Set<number>();

        // Helper to strip accents, apostrophes, turn punctuation to spaces, and remove extra whitespace
        const normalizeStr = (s: string) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

       // Levenshtein distance for fuzzy string matching (0.0 to 1.0 similarity)
       const getSimilarity = (s1: string, s2: string) => {
           if (s1 === s2) return 1.0;
           const len1 = s1.length, len2 = s2.length;
           if (!len1 || !len2) return 0.0;
           const dp = Array.from({length: len1 + 1}, () => new Array(len2 + 1).fill(0));
           for (let i = 0; i <= len1; i++) dp[i][0] = i;
           for (let j = 0; j <= len2; j++) dp[0][j] = j;
           for (let i = 1; i <= len1; i++) {
               for (let j = 1; j <= len2; j++) {
                   const cost = s1[i-1] === s2[j-1] ? 0 : 1;
                   dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
               }
           }
           return 1 - (dp[len1][len2] / Math.max(len1, len2));
       };

        for (const item of detected) {
            const normTitle = normalizeStr(item.title);
            const rawTokens = new Set(normalizeStr(item.rawText).split(' ').filter(t => t.length > 1));

            const match = dbItems.find(dbItem => {
                const dbTitleNorm = normalizeStr(dbItem.title);
                
                // 1. Exact Match (post-normalization catches Jupiters vs Jupiter's)
                if (dbTitleNorm === normTitle) return true;

                // 2. Substring Match (e.g. "Dune" inside "Dune Messiah")
                if (normTitle.length > 4 && dbTitleNorm.includes(normTitle)) return true;
                if (dbTitleNorm.length > 4 && normTitle.includes(dbTitleNorm)) return true;

                // 3. String-level Typo Match (fixes minor OCR failures on full strings)
                if (getSimilarity(dbTitleNorm, normTitle) > 0.8) return true;

                // 4. Fuzzy Token Match (checking raw physical text against DB title)
                const dbTokens = dbTitleNorm.split(' ').filter(t => t.length > 1);
                if (dbTokens.length > 0 && rawTokens.size > 0) {
                    let overlap = 0;
                    dbTokens.forEach(t => { 
                        if (rawTokens.has(t)) {
                            overlap++;
                        } else {
                            for (const rt of rawTokens) {
                                if (getSimilarity(t, rt) >= 0.8) { overlap++; break; }
                            }
                        }
                    });
                    
                    // If 60% of the important DB words are visibly printed on the item
                    if (overlap / dbTokens.length >= 0.6) return true;
                }
                return false;
            });

            if (match) {
                matchedDbItemIds.add(match.id);
                inCollection.push({ ...item, matchedItem: { id: match.id, title: match.title, slug: match.slug, amount: match.amount, locationName: match.locations?.[0]?.container?.name || null } });
            } else {
                newToYou.push(item);
            }
        }

        const missingFromScope = (scopeType !== 'all' ? dbItems.filter(i => !matchedDbItemIds.has(i.id)) : []).map(i => ({ id: i.id, title: i.title, slug: i.slug, locationName: i.locations?.[0]?.container?.name || null }));

        return json({ success: true, draftPath: webPath, totalDetected: detected.length, inCollection, newToYou, missingFromScope });
    } catch (e: any) {
        return json({ error: e.message || 'Comparison scan failed' }, { status: 500 });
    }
};