import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/database';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { hashSessionToken, checkRateLimit } from '$lib/server/security';

export const actions = {
    default: async ({ cookies, request, getClientAddress }) => {
        // Throttle login attempts to 5 per minute per IP to prevent brute force
        if (!checkRateLimit(`login:${getClientAddress()}`, 5, 60000)) {
            return fail(429, { error: true, message: 'Too many attempts. Please wait a minute.' });
        }

        const { username, password } = Object.fromEntries(await request.formData()) as Record<string, string>;

        if (!username || !password) {
            return fail(400, {
                error: true,
                message: '<strong>Username</strong> and/or <strong>password</strong> can not be blank.'
            });
        }

        let user = await db.user.findUnique({
            where: { username: username.trim() }
        });

        if (!user) {
            return fail(400, {
                error: true,
                message: 'User does not exist.'
            });
        } else {
            const validPassword = await bcrypt.compare(password, user.password);

            if (!validPassword) {
                return fail(400, {
                    error: true,
                    message: 'You have entered invalid credentials.'
                });
            }
        }

        const rawSessionId = crypto.randomUUID();
        const hashedSessionId = hashSessionToken(rawSessionId);

        await db.user.update({
            where: { id: user.id },
            data: { sessionHash: hashedSessionId }
        });

        cookies.set('session', rawSessionId, {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 30
        });

        redirect(303, '/');
    }
} satisfies Actions;