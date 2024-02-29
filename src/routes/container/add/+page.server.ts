import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import slugify from 'slugify';
import { writeFileSync } from "fs";
import { db } from '$lib/server/database';
import { getTagIds } from "$lib/server/services";

export const actions = {
    default: async ({ locals, request }) => {
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

        let filename = null;

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

        const container = await db.container.create({
            data: {
                name: name.trim(),
                photoPath: filename,
                description: description.trim(),
                location : data.location?.trim(),
            }
        });

        const trayCount = Number(data.numtrays);
        const startTray = Number(data.starttray);

        for(let i = startTray; i < (trayCount + startTray); i++) {
            const trayId = i.toString().padStart(3, '0')
            await db.container.create(
                {
                    data: {
                        parentId: container.name,
                        name: `${name} ${trayId}`,
                        description: "",
                    }
                }
            )
        }
    
        redirect(302, `/container/${container?.name}`);
    }
} satisfies Actions;