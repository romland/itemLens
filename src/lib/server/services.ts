import type { KVP, Prisma } from '@prisma/client';
import { db } from '$lib/server/database';
import slugify from 'slugify';

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
