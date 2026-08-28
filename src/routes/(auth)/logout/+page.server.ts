import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { invalidateSession } from '$lib/server/session';

export const actions = {
    default: async ({ cookies }) => {
		const session = cookies.get('session');
		if (session) {
			await invalidateSession(session);
		}

        cookies.delete('session', { path: '/' });
        redirect(303, '/');
    }
} satisfies Actions;
