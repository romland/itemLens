import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { redirect } from "@sveltejs/kit";
import { marked } from "marked";

/*
  inventory   Inventory? @relation(fields: [inventoryId], references: [id])
  inventoryId Int?

  author   User @relation(fields: [authorId], references: [id])
  authorId Int

  photos     Photo[]
  documents  Document[]
  tags       Tag[]
  locations  Container[]
  attributes KVP[] // e.g. width, height, color (should override colors of photo, I guess), etc
  usage      InUse[]
*/

export const load = (async ({ locals, params }) => {
    const item = await db.item.findFirst({
        where: {
            AND: [
                { author: { id: locals.user.id } },
                { id: Number(params.id) }
            ]
        },
        include: {
            inventory: true,
            photos: true,
            documents: true,
            tags: true,
            locations: true,
            attributes: true,
            usage: true,
        }
    });

    if (!item) {
        redirect(302, '/');
    }

    console.log("DEBUG page.server.ts", item);
    return {
        item: {
            ...item,
            contentToHtml: await marked.parse(item.description!)
        }
    };
}) satisfies PageServerLoad;
