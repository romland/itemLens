import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
    // If the user is not an admin, immediately kick them to the home page
    if (!locals.user?.isAdmin) {
        throw redirect(303, '/');
    }
    
    return {};
}) satisfies LayoutServerLoad;