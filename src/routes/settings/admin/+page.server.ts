import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import crypto from 'crypto';
import type { PageServerLoad, Actions } from './$types';
import bcrypt from 'bcryptjs';
import { exec } from 'child_process';
import { promisify } from 'util';
    import { env } from '$env/dynamic/private';

    bcrypt.setRandomFallback((len) => Array.from(crypto.randomBytes(len)));

const execAsync = promisify(exec);

async function checkCommand(cmd: string) {
    try {
        await execAsync(`command -v ${cmd}`);
        return true;
    } catch {
        return false;
    }
}

async function checkService(url: string) {
    try {
        await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
        return true;
    } catch {
        return false;
    }
}

export const load = (async ({ locals }) => {
    if (!locals.user?.isAdmin) throw redirect(303, '/profile');

    const allUsers = await db.user.findMany({ 
        select: { id: true, username: true, name: true, email: true, isAdmin: true, canCreateInventories: true } 
    });

    const deps = {
        ffmpeg: await checkCommand('ffmpeg'),
        pdftoppm: await checkCommand('pdftoppm'),
        ytdlp: await checkCommand('yt-dlp'),
        rembg: await checkService(`${env.REMBG_URL || 'http://localhost:7000'}/api/remove`),
        paddleocr: await checkService(`${env.PADDLE_URL || 'http://localhost:8000'}/`),
        singlefile: await checkService(`${env.SINGLEFILE_URL || 'http://localhost:8001'}/`)
    };

    return { allUsers, deps };
}) satisfies PageServerLoad;

export const actions = {
    createUser: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });
        
        const data = await request.formData();
        const username = data.get('username') as string;
        const password = data.get('password') as string;
        
        if (!username || !password) return fail(400, { error: true, message: "Username and password required." });

        try {
            await db.user.create({
                data: {
                    username: username.trim(),
                    password: await bcrypt.hash(password, await bcrypt.genSalt(10)),
                    token: crypto.randomUUID()
                }
            });
            return { success: true, message: `User '${username}' created!` };
        } catch (e) {
            return fail(400, { error: true, message: "Username likely already exists." });
        }
    },
    
    updateUser: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });

        const data = await request.formData();
        const id = Number(data.get('id'));
        if (!id) return fail(400, { error: true, message: "Invalid User ID." });

        const name = data.get('name') as string;
        const email = data.get('email') as string;
        const password = data.get('password') as string;
        const isAdmin = data.get('isAdmin') === 'true';
        const canCreateInventories = data.get('canCreateInventories') === 'true';

        if (id === locals.user.id && !isAdmin) {
            return fail(400, { error: true, message: "You cannot revoke your own admin status." });
        }

        let updateData: any = { name: name.trim(), email: email.trim(), isAdmin, canCreateInventories };
        if (password && password.trim().length >= 6) {
            updateData.password = await bcrypt.hash(password, await bcrypt.genSalt(10));
        }

        await db.user.update({ where: { id }, data: updateData });

        return { success: true, message: "User updated successfully." };
    }
} satisfies Actions;