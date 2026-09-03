import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
    import crypto from 'crypto';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import type { PageServerLoad, Actions } from './$types';

    bcrypt.setRandomFallback((len) => Array.from(crypto.randomBytes(len)));

export const load = (async ({ locals, cookies }) => {
    if (!locals.user) throw redirect(303, '/login');

    let currentSessionHash = '';
    const rawSessionId = cookies.get('session');
    if (rawSessionId) {
        const { hashSessionToken } = await import('$lib/server/security');
        currentSessionHash = hashSessionToken(rawSessionId);
    }
    
    const activeSessions = await db.session.findMany({ 
        where: { userId: locals.user.id },
        orderBy: { lastActiveAt: 'desc' }
    });

    return { activeSessions, currentSessionHash };
}) satisfies PageServerLoad;

export const actions = {
    updateProfile: async ({ locals, request }) => {
        if (!locals.user) return fail(401, { error: true, message: "Unauthorized" });
        const data = await request.formData();
        const name = data.get('name') as string;
        const email = data.get('email') as string;
        const avatarFile = data.get('avatar') as File;

        let updateData: any = { name, email };

        if (avatarFile && avatarFile.size > 0) {
            const buffer = Buffer.from(await avatarFile.arrayBuffer());
            const filename = `avatar-${locals.user.id}-${Date.now()}.webp`;
            await sharp(buffer).webp({ quality: 85 }).toFile(`${uploadsDiskFolder}/${filename}`);
            updateData.avatar = `${uploadsWebFolder}/${filename}`;
        }

        await db.user.update({
            where: { id: locals.user.id },
            data: updateData
        });

        return { success: true, message: 'Profile updated successfully.' };
    },

    updatePassword: async ({ locals, request }) => {
        if (!locals.user) return fail(401, { error: true, message: "Unauthorized" });
        const data = await request.formData();
        const password = data.get('password') as string;

        if (!password || password.length < 6) {
            return fail(400, { error: true, message: 'Password must be at least 6 characters.' });
        }

        await db.user.update({
            where: { id: locals.user.id },
            data: { password: await bcrypt.hash(password, await bcrypt.genSalt(10)) }
        });

        return { success: true, message: 'Password changed successfully.' };
    },

    updatePreferences: async ({ locals, request }) => {
        if (!locals.user) return fail(401, { error: true, message: "Unauthorized" });
        const data = await request.formData();
        const preferences = data.get('preferences') as string;
        
        await db.user.update({
            where: { id: locals.user.id },
            data: { preferences }
        });
        return { success: true, message: 'Preferences updated.' };
    },

    revokeSession: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: "Unauthorized" });
        
        const data = await request.formData();
        const sessionId = data.get('sessionId') as string;
        
        await db.session.deleteMany({ 
            where: { id: sessionId, userId: locals.user.id } 
        });
        
        return { success: true, message: "Device signed out successfully." };
    },
    
    revokeOtherSessions: async ({ cookies, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: "Unauthorized" });
        
        const rawSessionId = cookies.get('session');
        if (!rawSessionId) return fail(401);
        
        const { hashSessionToken } = await import('$lib/server/security');
        const currentSessionHash = hashSessionToken(rawSessionId);
        
        await db.session.deleteMany({ 
            where: { userId: locals.user.id, sessionHash: { not: currentSessionHash } }
        });
        
        return { success: true, message: "All other devices signed out." };
    }
} satisfies Actions;