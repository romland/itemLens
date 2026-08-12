import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import bcrypt from 'bcrypt';
import fs from 'fs';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';

export const load = (async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    return {};
}) satisfies PageServerLoad;

export const actions = {
    updateProfile: async ({ locals, request }) => {
        const data = await request.formData();
        const name = data.get('name') as string;
        const email = data.get('email') as string;
        const avatarFile = data.get('avatar') as File;

        let updateData: any = { name, email };

        if (avatarFile && avatarFile.size > 0) {
            const buffer = Buffer.from(await avatarFile.arrayBuffer());
            const filename = `avatar-${locals.user.id}-${Date.now()}.jpg`;
            fs.writeFileSync(`${uploadsDiskFolder}/${filename}`, buffer);
            updateData.avatar = `${uploadsWebFolder}/${filename}`;
        }

        await db.user.update({
            where: { id: locals.user.id },
            data: updateData
        });

        return { success: true, message: 'Profile updated successfully.' };
    },

    updatePassword: async ({ locals, request }) => {
        const data = await request.formData();
        const password = data.get('password') as string;

        if (!password || password.length < 6) {
            return fail(400, { error: true, message: 'Password must be at least 6 characters.' });
        }

        await db.user.update({
            where: { id: locals.user.id },
            data: { password: await bcrypt.hash(password, 10) }
        });

        return { success: true, message: 'Password changed successfully.' };
    }
} satisfies Actions;