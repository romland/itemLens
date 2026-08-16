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
Extract EVERY single item visible on the shelf.
For each item:
- title: The main title. If the text is completely unreadable, supply a generic placeholder (e.g., 'Unknown CD', 'Unreadable Book').
- subtitle: Secondary info like Author, Artist, or Brand.
- category: The type of item (e.g., 'book', 'cd', 'dvd', 'stamp', 'game').
- box: The spatial bounding box of the item's spine or front, as [ymin, xmin, ymax, xmax] normalized from 0 to 1000.
- low_confidence: Set to true if the text is blurry, occluded, or hard to read.
CRITICAL: Do not omit physical items just because you cannot read their labels. We need a 100% complete physical count of the items.
`;

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
                let retries = 3;
                while (retries > 0) {
                    try {
                        const res = await ai.models.generateContent({
                            model: 'gemini-3.1-flash-lite',
                            contents: [
                                { role: 'user', parts: [{ text: promptText }, { inlineData: { mimeType, data: base64Data } }] }
                            ],
                            config: {
                                responseMimeType: 'application/json',
                                responseSchema: {
                                    type: Type.OBJECT,
                                    properties: {
                                        collectionType: { type: Type.STRING },
                                        items: {
                                            type: Type.ARRAY,
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    title: { type: Type.STRING },
                                                    subtitle: { type: Type.STRING },
                                                    category: { type: Type.STRING },
                                                    box: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: '[ymin, xmin, ymax, xmax] normalized 0-1000' },
                                                    low_confidence: { type: Type.BOOLEAN }
                                                },
                                                required: ['title', 'subtitle', 'category', 'box', 'low_confidence']
                                            }
                                        }
                                    },
                                    required: ['collectionType', 'items']
                                }
                            }
                        });
                        return JSON.parse(res.text!);
                    } catch (e: any) {
                        const is503 = e?.status === 503 || e?.status === 'UNAVAILABLE' || e?.message?.includes('503') || e?.message?.includes('UNAVAILABLE') || e?.message?.includes('demand');
                        if (is503 && retries > 1) {
                            retries--;
                            console.warn(`[Collection] Gemini API busy (503). Retrying in 4s... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 4000));
                        } else {
                            throw e;
                        }
                    }
                }

            },
            { targetType: 'global', targetId: 0, description: 'Analyzing collection items with Vision Model' }
        );

        return json({ success: true, draftPath: webPath, noteId: note.id, collectionType: aiResponse.collectionType, items: aiResponse.items });
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