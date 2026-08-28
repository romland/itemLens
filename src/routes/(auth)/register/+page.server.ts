import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/database';
import bcrypt from 'bcrypt';
import { checkRateLimit } from '$lib/server/security';
import { createSession, setSessionCookie } from '$lib/server/session';

export const actions = {
    default: async ({ request, getClientAddress }) => {
        // Throttle registration to 3 per minute per IP to prevent bot accounts
        if (!checkRateLimit(`register:${getClientAddress()}`, 3, 60000)) {
            return fail(429, { error: true, message: 'Registration rate limited. Try again later.' });
        }

        const { username, password } = Object.fromEntries(await request.formData()) as Record<string, string>;

        if (!username || !password) {
            return fail(400, {
                error: true,
                message: '<strong>Username</strong> and/or <strong>password</strong> can not be blank.'
            });
        }
        
        const user = await db.user.findUnique({
            where: { username: username.trim() }
        });

        if (user) {
            return fail(400, {
                error: true,
                message: '<strong>Username</strong> already exists.'
            });
        }

        const user = await db.user.create({
            data: {
                username: username.trim(),
                password: await bcrypt.hash(password, 10)
            }
        });

        const userAgent = request.headers.get('user-agent');
        const ip = getClientAddress();
        const rawSessionId = await createSession(user.id, userAgent, ip);
        setSessionCookie(cookies, rawSessionId);

        redirect(303, '/');
    }
} satisfies Actions;
