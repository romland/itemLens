import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/database';
import { checkRateLimit } from '$lib/server/security';
import { createSession, setSessionCookie } from '$lib/server/session';
import bcrypt from 'bcryptjs';
    import crypto from 'crypto';

    bcrypt.setRandomFallback((len) => Array.from(crypto.randomBytes(len)));

export const actions = {
    default: async ({ request, getClientAddress, cookies }) => {
        // Throttle registration to 3 per minute per IP to prevent bot accounts
        if (!checkRateLimit(`register:${getClientAddress()}`, 3, 60000)) {
            return fail(429, { error: true, message: 'Registration rate limited. Try again later.' });
        }

        const { username, password, passwordConfirm } = Object.fromEntries(await request.formData()) as Record<string, string>;

        if (!username || !password) {
            return fail(400, {
                error: true,
                message: '<strong>Username</strong> and/or <strong>password</strong> can not be blank.'
            });
        }
        
        const existingUser = await db.user.findUnique({
            where: { username: username.trim() }
        });

        if (existingUser) {
            return fail(400, {
                error: true,
                message: '<strong>Username</strong> already exists.'
            });
        }

        if (password !== passwordConfirm) {
            return fail(400, {
                error: true,
                message: '<strong>Passwords</strong> do not match.'
            });
        }

        const newUser = await db.user.create({
            data: {
                username: username.trim(),
                password: await bcrypt.hash(password, await bcrypt.genSalt(10))
            }
        });

        const userAgent = request.headers.get('user-agent');
        const ip = getClientAddress();
        const rawSessionId = await createSession(newUser.id, userAgent, ip);
        setSessionCookie(cookies, rawSessionId);

        redirect(303, '/');
    }
} satisfies Actions;
