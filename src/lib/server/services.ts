import type { KVP, Prisma } from '@prisma/client';
import { db } from '$lib/server/database';
import slugify from 'slugify';
import fs from 'fs';
import { getSafeFilename } from '$lib/server/photouploads';
import { logActivity } from '$lib/server/logger';

export const getTagIds = async (tagcsv: string) => {
    const ids: { id: number }[] = [];

    if (tagcsv) {
        const tagNames = tagcsv.split(',');

        const tags = tagNames.map(async (tagName) => {
            const name = tagName.trim().toLowerCase();
            const slug = slugify(name);

            let tag = await db.tag.findFirst({
                where: { slug: slug }
            });

            if (!tag) {
                tag = await db.tag.create({
                    data: { name, slug }
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
                await logActivity(target.itemId, 'AI Analysis', `Saved AI summary for pasted document`, 'success');
            } else {
                await logActivity(target.itemId, 'AI Analysis', `No summary generated (content unreadable or too short)`, 'warning');
            }
        }        
    }
}
