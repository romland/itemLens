import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import type { Actions } from './$types';

export const actions = {
    default: async ({ params, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { error: true, message: 'Forbidden. Viewer access only.' });

        await db.container.deleteMany({
            where: {
                name: params.slug,
                inventoryId: locals.activeInventoryId
            }
        });

        redirect(303, '/container');
    }
} satisfies Actions;