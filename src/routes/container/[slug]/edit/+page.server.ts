import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from "./$types";
import { writeFileSync } from "fs";
import slugify from 'slugify';
import { db } from '$lib/server/database';
import sharp from 'sharp';

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
                { inventoryId: locals.activeInventoryId }
            ]
        },
    });

    if (!post) {
        redirect(302, '/');
    }

    return  { item: post };
}) satisfies PageServerLoad;

export const actions = {
    default: async ({ request, params, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { error: true, message: 'Forbidden. Viewer access only.' });

        const data = Object.fromEntries(await request.formData());
        const name = data.name as string;
        const description = data.description as string;
        const file = data.photoPath as File;

        /*
        // TODO: Check so that it's in the right format (one character, basically -- A-Z)
        if (name.length !== 1) {
            return fail(400, {
                error: true,
                message: 'Field <strong>Name</strong> must be one character (for now).'
            });
        }
        */

        const post = await db.container.findUnique({
            where: {
                inventoryId_name: { inventoryId: locals.activeInventoryId, name: data.id as string }
            }
        });

        let filename = post?.photoPath;

        if (file.size > 0) {
			const buffer = Buffer.from(await file.arrayBuffer());
            const date = new Date().toISOString()
                .replaceAll('-', '')
                .replaceAll(':', '')
                .replace(/T/, '')
                .replace(/\..+/, '');

            filename = date + '-' + slugify(file.name.toLowerCase()).replace(/\.[^/.]+$/, '') + '.webp';

			try {
				await sharp(buffer).webp({ quality: 85 }).toFile(`static/images/containers/${filename}`);
				const thumbFilename = filename.replace(/\.[^/.]+$/, "_thumb.webp");
				await sharp(buffer).resize({ width: 256 }).webp({ quality: 80 }).toFile(`static/images/containers/${thumbFilename}`);
			} catch (e) { console.error("Failed to generate container thumbnail", e); }

            filename = "/images/containers/" + filename;
        }

        await db.container.update({
            where: { inventoryId_name: { inventoryId: locals.activeInventoryId, name: data.id as string } },
            data: {
                name: name.trim(),
                photoPath: filename,
                description: description.trim(),
                location : (data.location as string) || null,
            }
        });

        // TODO: act on numtrays (removing them is futile... perhaps just allow adding for now, can't be arsed to remove)
        // TODO: We don't touch the number of trays at all for now (since it involves possibly related items). Later. CBA.

        redirect(302, `/container/${encodeURIComponent(name.trim())}`);
    }
} satisfies Actions;