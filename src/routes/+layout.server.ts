import type { LayoutServerLoad } from "./$types";

export const load = (async ({ locals, setHeaders }) => {
    setHeaders({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    });
    return { user: locals.user };
}) satisfies LayoutServerLoad;