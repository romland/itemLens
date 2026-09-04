import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import { createSession, setSessionCookie } from '$lib/server/session';
import bcrypt from 'bcryptjs';
import type { PageServerLoad, Actions } from './$types';
import { getSystemDiagnostics } from '$lib/server/diagnostics';

export const load = (async () => {
    // Re-verify just in case the hook check was bypassed
    const userCount = await db.user.count();
    if (userCount > 0) throw redirect(303, '/login');

    return { diagnostics: await getSystemDiagnostics() };
}) satisfies PageServerLoad;

export const actions = {
    default: async ({ request, cookies, getClientAddress }) => {
        const data = await request.formData();
        
        const username = data.get('username') as string;
        const password = data.get('password') as string;

        if (!username || !password) {
            return fail(400, { error: true, message: "Username and Password are required." });
        }

        // 1. Create the Master Admin User
        const adminUser = await db.user.create({
            data: {
                username: username.trim(),
                password: await bcrypt.hash(password, await bcrypt.genSalt(10)),
                isAdmin: true,
                canCreateInventories: true
            }
        });

        // 2. Automatically log them in
        const userAgent = request.headers.get('user-agent');
        const ip = getClientAddress();
        const rawSessionId = await createSession(adminUser.id, userAgent, ip);
        
        setSessionCookie(cookies, rawSessionId);

        // DO NOT REDIRECT! Return success so the UI stays on the page and advances to Step 2
        return { success: true };
    }
} satisfies Actions;
