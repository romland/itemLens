import { db } from '$lib/server/database';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';
import { apiQueue } from '$lib/server/queue/index';
import { withRetry } from './retry';
import { taskManager } from './taskManager';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const BASE_COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Grey', 'Brown', 'Beige', 'Purple', 'Pink', 'Orange', 'Navy', 'Teal', 'Multicolor', 'Metallic', 'Clear'];

const eavResponseSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Machine name, e.g., form_factor' },
            uiLabel: { type: 'string', description: 'Premium human label, e.g., Form Factor' },
            type: { type: 'string', enum: ['string', 'enum', 'boolean', 'number'] },
            options: { type: 'array', items: { type: 'string' }, description: 'Array of enums if type is enum' },
            matchWeight: { type: 'string', enum: ['STRICT_DEDUPE', 'FUZZY_SECONDARY', 'METADATA_ONLY'] },
            extractionMethod: { type: 'string', enum: ['VISION_STRICT', 'HUMAN_REQUIRED', 'HYBRID'] }
        },
        required: ['name', 'uiLabel', 'type', 'matchWeight', 'extractionMethod']
    }
};

export async function getActiveSchema(inventoryId: number, categoryId?: number | null, fetchAll: boolean = false) {
    const inv = await db.inventory.findUnique({ where: { id: inventoryId } });
    const archetype = (inv as any)?.archetype || 'generic';
    const allowAutoTaxonomy = (inv as any)?.allowAutoTaxonomy ?? false;

    // If auto-taxonomy is disabled for this inventory, return no extractions
    if (!allowAutoTaxonomy) return [];

    const whereClause: any = { inventoryId };
    if (!fetchAll) {
        whereClause.OR = [{ categoryId: null }, ...(categoryId ? [{ categoryId }] : [])];
    }
    
    const dbFields = await db.templateField.findMany({ where: whereClause });

    // Only inject physical base traits for physical hard-goods. Omit for media/books.
    const globalBaseFields = (archetype === 'media' || archetype === 'books') ? [] : [
        { id: undefined, name: 'brand', uiLabel: 'Brand', type: 'string', options: null, matchWeight: 'STRICT_DEDUPE', extractionMethod: 'HYBRID' },
        { id: undefined, name: 'primary_color', uiLabel: 'Color', type: 'enum', options: BASE_COLORS, matchWeight: 'STRICT_DEDUPE', extractionMethod: 'VISION_STRICT' }
    ];

    return [
        ...globalBaseFields,
        ...dbFields.map(f => ({ id: f.id, name: f.name, uiLabel: f.uiLabel, type: f.type, options: f.options ? JSON.parse(f.options) : null, matchWeight: f.matchWeight, extractionMethod: f.extractionMethod }))
    ];
}

export async function bootstrapInventorySchema(inventoryId: number, domainName: string) {
    const inv = await db.inventory.findUnique({ where: { id: inventoryId } });
    if (!(inv as any)?.allowAutoTaxonomy) return false;

    const taskId = taskManager.start('global', inventoryId, `Bootstrapping AI taxonomy rules for "${domainName}"`);
    console.log(`[Taxonomy Engine] 🚀 Starting schema generation for inventory ID ${inventoryId}: "${domainName}"`);
    
    try {
        // We explicitly ban Color/Brand because they are injected globally by getActiveSchema().
        // Prevent the AI from reinventing our global base layer
        return await apiQueue.add(async () => {
            const prompt = `You are a Principal Data Architect designing a strict EAV taxonomy for an inventory tracking: "${domainName}".
We need BOTH human-friendly specific terms AND abstract groupings for "similar item" matching.

STRUCTURAL REQUIREMENTS (Output EXACTLY 5-6 attributes):

1. ONE "Form Factor" or "Item Sub-Type" (extractionMethod: "VISION_STRICT").
   - The specific, human-friendly noun for the item.
   - E.g., Garment Style (T-Shirt, Hoodie, Jeans), Tool Type (Wrench, Saw).

2. ONE "Macro Functional Group" (extractionMethod: "VISION_STRICT").
   - The abstract grouping of WHERE it goes or WHAT it does, to group interchangeable items together.
   - E.g., Body Placement (Torso, Legs, Feet, Head), Primary Action (Cutting, Fastening, Measuring).

3. TWO "Micro Visual Traits" (extractionMethod: "VISION_STRICT" or "HYBRID").
   - E.g., Pattern, Texture, Sleeve Length, Connector Type.

4. ONE or TWO "Human Context" fields (extractionMethod: "HUMAN_REQUIRED").
   - Context the camera cannot accurately know without reading a physical tag.
   - E.g., Size, Storage Capacity, Material. ALWAYS use type "enum" for sizes with exhaustive options.

CRITICAL BANS:
- NO "Brand", "Manufacturer", "Make", or "Color" (tracked globally). DO NOT output any field containing these words.
- 'matchWeight' MUST be "STRICT_DEDUPE", "FUZZY_SECONDARY", or "METADATA_ONLY".
- For ALL enums, provide a HIGHLY EXHAUSTIVE 'options' array. For item types/forms, generate at least 15-25 common values to prevent cold-start issues. For sizes, include a full standard range.`;

            const res = await withRetry(() => ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { responseMimeType: 'application/json', responseSchema: eavResponseSchema as any }
            }), 3, 2000, `Inventory Bootstrap: ${domainName}`, { prompt });
            
            const fields = JSON.parse(res.text!);
            console.log(`[Taxonomy Engine] 🟢 Received ${fields.length} schema fields for "${domainName}". Saving to DB:`, JSON.stringify(fields, null, 2));
            
            for (const f of fields) {
                const existing = await db.templateField.findFirst({
                    where: { inventoryId, categoryId: null, name: f.name }
                });
                if (!existing) {
                    const created = await db.templateField.create({
                        data: { name: f.name, uiLabel: f.uiLabel, type: f.type, options: f.options ? JSON.stringify(f.options) : null, matchWeight: f.matchWeight, extractionMethod: f.extractionMethod, inventoryId, categoryId: null }
                    });
                    console.log(`[Taxonomy Engine] 💾 Inserted TemplateField Rule [Inventory ID ${inventoryId}]:`, created);
                }
            }
            return true;
        });
    } catch (e) {
        console.error(`[Taxonomy Engine] 🔴 Inventory schema bootstrap failed for ${domainName}:`, e);
        throw e;
    } finally {
        taskManager.end(taskId);
    }
}

export async function bootstrapCategorySchema(categoryId: number, categoryName: string, inventoryId: number) {
    const inv = await db.inventory.findUnique({ where: { id: inventoryId } });
    if (!(inv as any)?.allowAutoTaxonomy) return false;

    const taskId = taskManager.start('global', inventoryId, `Bootstrapping category schema for "${categoryName}"`);
    console.log(`[Taxonomy Engine] 🚀 Starting category schema generation for ID ${categoryId}: "${categoryName}"`);

    try {
        const existingInvFields = await db.templateField.findMany({ where: { inventoryId, categoryId: null } });
        const existingLabels = ['Brand', 'Color', ...existingInvFields.map(f => f.uiLabel)].join(', ');

        await apiQueue.add(async () => {
            const prompt = `You are a Principal Data Architect. Define 1-3 critical visual attributes needed to uniquely identify and deduplicate an item specifically in the sub-category: "${categoryName}".
            CRITICAL RULES:
            1. NO REDUNDANCY: The overarching inventory ALREADY tracks these fields globally: [${existingLabels}]. DO NOT create attributes that conceptually overlap with these (e.g. no "Fabric" if "Material" exists, no "Brand Name" if "Brand" exists).
            2. CATEGORY-SPECIFIC ONLY: Only generate attributes unique to "${categoryName}" (e.g., "Sleeve Length" for shirts, "Screen Size" for monitors). Do not generate generic fields.
            3. Categorize EVERY attribute with an extractionMethod:
               - "VISION_STRICT": 100% undeniable visual geometry or physical form.
               - "HYBRID": Visible text, brands, or labels that might be obscured.
               - "HUMAN_REQUIRED": Context the camera CANNOT reliably know without a tag (e.g., size, capacity, format).
            4. Use premium, human-friendly 'uiLabel's.
            5. For ALL enums, provide a HIGHLY EXHAUSTIVE 'options' array (15-25 values where applicable).`;

            const res = await withRetry(() => ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { responseMimeType: 'application/json', responseSchema: eavResponseSchema as any }
            }), 3, 2000, `Category Bootstrap: ${categoryName}`, { prompt });
            
            const fields = JSON.parse(res.text!);
            console.log(`[Taxonomy Engine] 🟢 Received ${fields.length} fields for category "${categoryName}". Saving to DB:`, JSON.stringify(fields, null, 2));

            for (const f of fields) {
                const existing = await db.templateField.findFirst({
                    where: { inventoryId, categoryId, name: f.name }
                });
                if (!existing) {
                    const created = await db.templateField.create({
                        data: { name: f.name, uiLabel: f.uiLabel, type: f.type, options: f.options ? JSON.stringify(f.options) : null, matchWeight: f.matchWeight, extractionMethod: f.extractionMethod, inventoryId, categoryId }
                    });
                    console.log(`[Taxonomy Engine] 💾 Inserted TemplateField Rule [Category ID ${categoryId}]:`, created);
                }
            }
        });
    } catch (e) {
        console.error(`[Taxonomy Engine] 🔴 Category schema bootstrap failed for ${categoryName}:`, e);
    } finally {
        taskManager.end(taskId);
    }
}