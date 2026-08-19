import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';
import { db } from '$lib/server/database';
import { apiQueue } from '$lib/server/queue/index';
import { withRetry } from './retry';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const BASE_COLOR_FAMILIES = [
    'Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 
    'Grey', 'Brown', 'Beige', 'Purple', 'Pink', 'Orange', 
    'Navy', 'Teal', 'Multicolor', 'Metallic', 'Clear'
];

/**
 * Bootstraps a strict EAV schema for a new category via LLM.
 */
export async function generateTaxonomySchema(categoryId: number, domainName: string, inventoryId: number): Promise<void> {
    await apiQueue.add(async () => {
        const prompt = `
        You are an inventory architect. Define a strict JSON schema of the 3-5 most critical visual attributes needed to uniquely identify and deduplicate items in the category: "${domainName}".
        
        CRITICAL RULES:
        1. Base it ONLY on visual truths (e.g., "visual_texture").
        2. DO NOT include "color" (handled globally).
        3. DO NOT include "brand" or "title" (handled globally).
        4. "matchWeight" MUST be "STRICT_DEDUPE", "FUZZY_SECONDARY", or "METADATA_ONLY".
        
        Return an array of objects matching this exact structure:
        [
          { "name": "collar_style", "type": "enum", "options": ["crew", "v-neck", "polo", "button-down", "none"], "matchWeight": "STRICT_DEDUPE" },
          { "name": "graphic_text", "type": "string", "options": null, "matchWeight": "FUZZY_SECONDARY" }
        ]
        `;

        try {
            const response = await withRetry(() => ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { responseMimeType: 'application/json' }
            }), 3, 2000, 'Taxonomy Schema Generation', { prompt });
            
            const fields = JSON.parse(response.text!);
            for (const field of fields) {
                await db.templateField.upsert({
                    where: { inventoryId_categoryId_name: { inventoryId, categoryId, name: field.name } },
                    update: {},
                    create: {
                        name: field.name,
                        type: field.type,
                        options: field.options ? JSON.stringify(field.options) : null,
                        matchWeight: field.matchWeight,
                        inventoryId,
                        categoryId
                    }
                });
            }
        } catch (e) {
            console.error(`Failed to generate schema for ${domainName}:`, e);
        }
    });
}

/**
 * Fetches the active EAV rules for a given context.
 * @param fetchAll If true, grabs every field in the inventory (useful for bulk collection scans where category is unknown).
 */
export async function getActiveSchema(inventoryId: number, categoryId?: number | null, fetchAll: boolean = false) {
    const whereClause: any = { inventoryId };
    if (!fetchAll) {
        whereClause.OR = [{ categoryId: null }, ...(categoryId ? [{ categoryId }] : [])];
    }
    
    const fields = await db.templateField.findMany({ where: whereClause });

    // We automatically prepend our global strict dedupe rules
    return [
        { name: 'primary_color_family', type: 'enum', options: JSON.stringify(BASE_COLOR_FAMILIES), matchWeight: 'STRICT_DEDUPE' },
        { name: 'brand', type: 'string', options: null, matchWeight: 'STRICT_DEDUPE' },
        ...fields.map(f => ({ id: f.id, name: f.name, uiLabel: f.uiLabel, type: f.type, options: f.options ? JSON.parse(f.options) : null, matchWeight: f.matchWeight, extractionMethod: f.extractionMethod }))
    ];
}