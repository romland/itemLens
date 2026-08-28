import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/database';
import { hashSessionToken } from '$lib/server/security';

export const actions = {
    default: async ({ cookies }) => {
		const session = cookies.get('session');
		if (session) {
			await db.user.updateMany({
				where: { sessionHash: hashSessionToken(session) },
				data: { sessionHash: null }
			});
		}

        cookies.delete('session', { path: '/' });
        redirect(303, '/');
    }
} satisfies Actions;
