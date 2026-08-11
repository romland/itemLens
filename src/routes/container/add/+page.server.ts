import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import slugify from 'slugify';
import { writeFileSync } from "fs";
import { db } from '$lib/server/database';
import { getTagIds } from "$lib/server/services";
import imageThumbnail from 'image-thumbnail';

export const actions = {
    default: async ({ locals, request }) => {
        const data = Object.fromEntries(await request.formData());
        const name = data.name as string;
        const description = data.description as string;
        const file = data.photoPath as File;
        const mode = data.mode as string;

        let filename = null;

        if (file.size > 0) {
			const buffer = Buffer.from(await file.arrayBuffer());
            const date = new Date().toISOString()
                .replaceAll('-', '')
                .replaceAll(':', '')
                .replace(/T/, '')
                .replace(/\..+/, '');

            filename = date + '-' + slugify(file.name.toLowerCase());

			writeFileSync(`static/images/containers/${filename}`, buffer);

			try {
				const thumb = await imageThumbnail(buffer, { width: 256, responseType: 'buffer', jpegOptions: { force: true, quality: 90 } } as any);
				const thumbFilename = filename.replace(/\.[^/.]+$/, "_thumb.jpg");
				writeFileSync(`static/images/containers/${thumbFilename}`, thumb);
			} catch (e) { console.error("Failed to generate container thumbnail", e); }

            filename = "/images/containers/" + filename;
        }

        const container = await db.container.create({
            data: {
                name: name.trim(),
                photoPath: filename,
                description: description.trim(),
                location : (data.location as string)?.trim(),
            }
        });

        if (mode === 'batch') {
            const trayCount = Number(data.numtrays) || 0;
            const startTray = Number(data.starttray) || 1;

            for(let i = startTray; i < (trayCount + startTray); i++) {
                const trayId = i.toString().padStart(3, '0')
                await db.container.create({
                    data: {
                        parentId: container.name,
                        name: `${name} ${trayId}`,
                        description: "",
                    }
                });
            }
        }

        // STUB: Label Studio Integration
        const printLabel = data.printLabel;
        const labelSize = data.labelSize as string;
        if (printLabel === 'on') {
            console.log(`[STUB] Queuing thermal label print for container: ${name} | Size: ${labelSize}`);
        }
    
        redirect(302, `/container/${container?.name}`);
    }
} satisfies Actions;