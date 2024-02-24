import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from "./$types";
import { writeFileSync } from "fs";
import slugify from 'slugify';
import { db } from '$lib/server/database';
import { getTagIds } from "$lib/server/services";
import type { Tag } from "@prisma/client";

export const load = (async ({ locals, params }) => {
    const item = await db.item.findFirst({
        where: {
            AND: [
                { author: { id: locals.user.id } },
                { id: Number(params.id) },
            ]
        },
        include: {
            inventory: true,
            photos: true,
            documents: true,
            tags: true,
            locations: {
                include: {  
                    container: true,
                }
            },
            attributes: true,
            usage: true,
        }
    });

    if (!item) {
        redirect(302, '/');
    }

    const containers = await db.container.findMany({
        select : {
          name : true,
          parentId : true,
          photoPath : true,
          description : true,
          location : true,
          children : {
            select : {
              name : true,
              parentId : true,
            }
          },
        },
        where: {
            AND: [
                { parentId: null }
            ]
        },
        orderBy: {
          name : "asc"
        }
    });

    return {
        item: {
            ...item,
            tagcsv: item.tags.map((tag: Tag, i: number) => i == 0 ? tag.name : ' ' + tag.name)
        },
        containers
    };
}) satisfies PageServerLoad;

export const actions = {
    default: async ({ request, params }) => {
        const data = Object.fromEntries(await request.formData());

        const title = data.title as string;
        const content = data.content as string;
        const tagcsv = data.tagcsv as string;
        const file = data.file as File;

/*
TODO:
- take care of refresh_images = essentially delete it, but then re-add it (orgPath) by running everything over it again,
  this is when we get happy that we populate other 'tables' (think: attributes) on client-side
- take care of delete_images
  Make sure to delete on disk too (or at least move away)
- delete all containers (to be re-inserted)
- delete all attributes (to be re-inserted)
*/

        if (title.length == 0) {
            return fail(400, {
                error: true,
                message: 'Field <strong>Title</strong> cannot be blank.'
            });
        }

        const item = await db.item.findUnique({
            where: {
                id: Number(params.id)
            }
        });


        let filename = item?.photo;

        if (file.size > 0) {
            const date = new Date().toISOString()
                .replaceAll('-', '')
                .replaceAll(':', '')
                .replace(/T/, '')
                .replace(/\..+/, '');

            filename = date + '-' + slugify(file.name.toLowerCase());

            writeFileSync(`static/images/${filename}`, Buffer.from(await file.arrayBuffer()));
        }


        const ids = await getTagIds(tagcsv);

        await db.item.update({
            where: { id: Number(params.id) },
            data: {
                title: title.trim(),
                // TODO: This structure has changed
                // photo: filename,
                slug: slugify(title.toLowerCase()),
                description: content.trim(),
                tags: {
                    set: [...ids]
                }
            }
        });
        console.warn("NOTE: Photo structure changed, this needs to be redone");

        redirect(302, `/${item?.id}/${item?.slug}`);
    }
} satisfies Actions;