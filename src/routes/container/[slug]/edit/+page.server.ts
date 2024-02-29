import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from "./$types";
import { writeFileSync } from "fs";
import slugify from 'slugify';
import { db } from '$lib/server/database';

export const load = (async ({ locals, params }) => {
    console.log(params);
    const post = await db.container.findFirst({
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
                // { author: { id: locals.user.id } },
                { name: params.slug },
            ]
        },
    });

    if (!post) {
        redirect(302, '/');
    }

    return  { item: post };
}) satisfies PageServerLoad;

export const actions = {
    default: async ({ request, params }) => {
        const data = Object.fromEntries(await request.formData());
        const name = data.name as string;
        const description = data.description as string;
        const file = data.photoPath as File;

        // TODO: Check so that it's in the right format (one character, basically -- A-Z)
        if (name.length !== 1) {
            return fail(400, {
                error: true,
                message: 'Field <strong>Name</strong> must be one character (for now).'
            });
        }

        const post = await db.container.findUnique({
            where: {
                name: data.id
            }
        });

        let filename = post?.photoPath;

        if (file.size > 0) {
            const date = new Date().toISOString()
                .replaceAll('-', '')
                .replaceAll(':', '')
                .replace(/T/, '')
                .replace(/\..+/, '');

            filename = date + '-' + slugify(file.name.toLowerCase());

            writeFileSync(`static/images/containers/${filename}`, Buffer.from(await file.arrayBuffer()));

            filename = "/images/containers/" + filename;
        }

        await db.container.update({
            where: { name: data.id },
            data: {
                name: name.trim(),
                photoPath: filename,
                description: description.trim(),
                location : data.location,
            }
        });

        // TODO: act on numtrays (removing them is futile... perhaps just allow adding for now, can't be arsed to remove)
        // TODO: We don't touch the number of trays at all for now (since it involves possibly related items). Later. CBA.

        redirect(302, `/container/${post?.name}`);
    }
} satisfies Actions;