import type { KVP, Prisma } from '@prisma/client';
import { db } from '$lib/server/database';
import slugify from 'slugify';
import fs from 'fs';
import { getSafeFilename } from '$lib/server/photouploads';
import { logActivity } from '$lib/server/logger';

export const getTagIds = async (tagcsv: string, inventoryId: number) => {
    const ids: { id: number }[] = [];

    if (tagcsv) {
        const tagNames = tagcsv.split(',');

        const tags = tagNames.map(async (tagName) => {
            const name = tagName.trim().toLowerCase();
            const slug = slugify(name);

            let tag = await db.tag.findFirst({
                where: { slug: slug, inventoryId }
            });

            if (!tag) {
                tag = await db.tag.create({
                    data: { name, slug, inventoryId }
                });
            }

            return tag;
        });

        for (const tag of tags) {
            const resolved = await tag;
            if (resolved?.id) {
                ids.push({ id: resolved.id });
            }
        }
    }

    return ids;
}

export function formKVPsToDBrows(formData: Record<string, any>)
{
  const kvps: Prisma.KVPCreateWithoutItemInput[] = [];

  for(const key in formData) {
    if(key.startsWith("kvpK")) {
      const index = parseInt(key.split("-")[1], 10);
      kvps.push({
        key: String(formData[key] ?? ''),
        value: String(formData[`kvpV-${index}`] ?? '')
      })
    }
  }
  return kvps;
}

export async function processFormDocuments(formData: FormData, target: { itemId?: number, timelineNoteId?: number }, diskFolder: string, webFolder: string) {
    const pastedDocsRaw = formData.getAll("pasted_documents[]");
    const pastedDocs = pastedDocsRaw.map(d => JSON.parse(d as string));
    for (const doc of pastedDocs) {
        const prefix = target.itemId ? `item-${target.itemId}` : `note-${target.timelineNoteId}`;
        const filename = getSafeFilename(`${prefix}-note`);
        fs.writeFileSync(`${diskFolder}/${filename}.txt`, doc.content, { encoding: "utf8" });
        await db.document.create({
            data: {
                itemId: target.itemId || null,
                timelineNoteId: target.timelineNoteId || null,
                type: "note",
                title: doc.title,
                source: "Pasted Note",
                path: `${webFolder}/${filename}.txt`,
                extracts: JSON.stringify([doc.content])
            }
        });
    }
    
    const preDocsRaw = formData.getAll("preprocessed_docs[]");
    const preDocs = preDocsRaw.map(d => JSON.parse(d as string));
    for (const doc of preDocs) {
        await db.document.create({
            data: {
                itemId: target.itemId || null,
                timelineNoteId: target.timelineNoteId || null,
                type: doc.type === 'text' ? 'note' : 'uncategorized',
                title: doc.title || doc.source || "Untitled Document",
                source: doc.source,
                path: doc.path,
                extracts: typeof doc.extracts === 'string' ? doc.extracts : JSON.stringify(doc.extracts || []),
                summary: doc.summary || null
            }
        });
        if (target.itemId) {
            await logActivity(target.itemId, 'Document Attached', `Saved pasted document: ${doc.title || doc.source}`, 'success');
            if (doc.summary) {
                await logActivity(target.itemId, 'Analysis', `Saved LLM summary for pasted document`, 'success');
            } else {
                await logActivity(target.itemId, 'Analysis', `No summary generated (content unreadable or too short)`, 'warning');
            }
        }        
    }
}

export async function createItemEntity(params: {
    title: string;
    description?: string;
    reason?: string;
    amount?: number | null;
    inventoryId: number;
    userId: number;
    containers?: string[];
    tagIds?: { id: number }[];
    photos?: Prisma.PhotoCreateWithoutItemInput[];
    attributes?: Prisma.KVPCreateWithoutItemInput[];
    extractedAttributes?: string | Record<string, any> | null;
    physical_traits?: string[];
    prominent_text_or_graphic?: string | null;
    distinctive_blemishes_or_wear?: string | null;
    color_mix?: any;
    clientId?: string;
    timelineNoteId?: number | null;
    duplicateDismissed?: boolean;
}) {
    const { getActiveSchema } = await import('$lib/server/ontology');
    const activeSchema = await getActiveSchema(params.inventoryId, null, true);

    const finalAttributes = params.attributes ? [...params.attributes] : [];

    if (params.extractedAttributes) {
        try {
            const attrs = typeof params.extractedAttributes === 'string' 
                ? JSON.parse(params.extractedAttributes) 
                : params.extractedAttributes;

            for (const [k, v] of Object.entries(attrs)) {
                if (v !== null && v !== '') {
                    const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v).trim();
                    if (valStr === '{}' || valStr === '[object Object]') continue; // Do not save empty JSON objects or literal garbage strings
                    // Prioritize Human UI edits: Only append if the form didn't already send this exact key
                    if (!finalAttributes.some(a => a.key === k)) {
                        finalAttributes.push({ key: k, value: valStr });
                    }
                }
            }
        } catch(e) { console.error("Failed to parse extracted attributes", e); }
    }

    // Ensure discriminators are saved cleanly as Attributes, separate from the generic NLP pool
    if (params.prominent_text_or_graphic && !finalAttributes.some(a => a.key === 'prominent_text_or_graphic')) {
        finalAttributes.push({ key: 'prominent_text_or_graphic', value: params.prominent_text_or_graphic });
    }
    if (params.distinctive_blemishes_or_wear && !finalAttributes.some(a => a.key === 'distinctive_blemishes_or_wear')) {
        finalAttributes.push({ key: 'distinctive_blemishes_or_wear', value: params.distinctive_blemishes_or_wear });
    }

    // Organic Schema Evolution - run across the final merged set (both AI-extracted and Human-edited)
    for (const attr of finalAttributes) {
        const field = activeSchema.find((f: any) => f.name === attr.key) as any;
        if (field && field.id && field.type === 'enum' && field.options) {
            const valStr = attr.value.trim();
            if (!field.options.map((o: string) => o.toLowerCase()).includes(valStr.toLowerCase())) {
                const newOptions = [...field.options, valStr];
                await db.templateField.update({ where: { id: field.id }, data: { options: JSON.stringify(newOptions) } });
                field.options = newOptions; // Update in-memory for subsequent matches in loop
            }
        }
    }

    // Idempotency: Protect against outbox retries and rapid double-saves
    if (params.clientId) {
        const existing = await db.item.findUnique({
            where: { clientId: params.clientId },
            include: { photos: true }
        });
        if (existing) {
            return existing;
        }
    }

    const safeTitle = params.title.trim() || "New Item";

    const { tokenizeAndStem } = await import('$lib/server/nlp');
    const semanticTokens = JSON.stringify(tokenizeAndStem([
        safeTitle, 
        params.description, 
        ...(params.physical_traits || [])
    ]));

    const item = await db.item.create({
        data: {
            clientId: params.clientId,
            title: safeTitle,
            description: params.description?.trim() || "",
            slug: slugify(safeTitle.toLowerCase()) || "new-item",
            inventoryId: params.inventoryId,
            authorId: params.userId,
            duplicateDismissed: params.duplicateDismissed || false,
            reason: params.reason || "",
            amount: params.amount !== undefined ? params.amount : null,
            semanticTokens,
            photos: params.photos && params.photos.length > 0 ? { create: params.photos } : undefined,
            attributes: finalAttributes.length > 0 ? { create: finalAttributes } : undefined,
            locations: params.containers && params.containers.length > 0 ? {
                create: params.containers.map(cont => ({
                    container: { connect: { inventoryId_name: { inventoryId: params.inventoryId, name: cont } } }
                }))
            } : undefined,
            tags: params.tagIds && params.tagIds.length > 0 ? { connect: params.tagIds } : undefined,
            timelineNotes: params.timelineNoteId ? { connect: [{ id: params.timelineNoteId }] } : undefined
        },
        include: { photos: true }
    });

    // Organic Background Schema Mapping
    if (params.physical_traits && params.physical_traits.length > 0) {
        const { ioQueue } = await import('$lib/server/queue/index');
        
        ioQueue.add(async () => {
            const kvpsToCreate = [];
            for (const field of activeSchema) {
                if (field.extractionMethod === 'HUMAN_REQUIRED') continue;
                if (field.type === 'enum' && field.options) {
                    for (const trait of params.physical_traits!) {
                        const normTrait = trait.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const match = field.options.find((opt: string) => opt.toLowerCase().replace(/[^a-z0-9]/g, '') === normTrait);
                        if (match) {
                            const existing = await db.kVP.findFirst({ where: { itemId: item.id, key: field.name } });
                            if (!existing && !kvpsToCreate.some(k => k.key === field.name)) {
                                kvpsToCreate.push({ itemId: item.id, key: field.name, value: match });
                            }
                        }
                    }
                }
            }
            if (kvpsToCreate.length > 0) {
                await db.kVP.createMany({ data: kvpsToCreate });
                await logActivity(item.id, 'Semantic Extraction', `Structured ${kvpsToCreate.length} attributes in background`, 'success');
            }
        });
    }

    if (params.color_mix && !finalAttributes.some(a => a.key === 'color_mix')) {
        await db.kVP.create({ data: { itemId: item.id, key: 'color_mix', value: typeof params.color_mix === 'string' ? params.color_mix : JSON.stringify(params.color_mix) } });
    }

    const { processItemPhotosBackground } = await import('$lib/server/photouploads');
    processItemPhotosBackground(item).catch(e => console.error(e));

    return item;
}
