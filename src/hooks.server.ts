import { redirect, type Handle } from "@sveltejs/kit";
import { db } from "$lib/server/database";
import { initFTS } from "$lib/server/fts";

// Initialize the SQLite FTS5 engine once on server boot
initFTS().catch(console.error);

export const handle = (async ({ event, resolve }) => {
	let theme: string = 'coffee';  // default theme

	const session = event.cookies.get('session');
	const newTheme = event.url.searchParams.get('theme');
	const cookieTheme = event.cookies.get('theme');
	const path = event.url.pathname;

	if (newTheme) {
		theme = newTheme;
	} else if (cookieTheme) {
		theme = cookieTheme;
	}

	if (session) {
        const user = await db.user.findUnique({
            where: { token: session },
            select: { id: true, username: true, name: true, email: true, avatar: true, isAdmin: true, preferences: true, inventoryAccess: true }
        });

        if (user) {
            event.locals.user = {
                id: user.id,
                username: user.username,
                name: user.name || user.username,
                email: user.email,
                avatar: user.avatar,
                isAdmin: user.isAdmin,
                preferences: user.preferences
            } as any;

            // Inventory Routing Logic
            const cookieInvId = event.cookies.get('activeInventoryId');
            const allowedIds = user.inventoryAccess.map(ia => ia.inventoryId);
            
            if (cookieInvId && allowedIds.includes(Number(cookieInvId))) {
                event.locals.activeInventoryId = Number(cookieInvId);
            } else if (allowedIds.length > 0) {
                event.locals.activeInventoryId = allowedIds[0];
                event.cookies.set('activeInventoryId', allowedIds[0].toString(), { path: '/' });
            } else {
                event.locals.activeInventoryId = 0;
            }

            // Sort Routing Logic (Remembered per inventory)
            const urlSort = event.url.searchParams.get('sort');
            if (urlSort) {
                event.cookies.set('itemlens_sort_' + event.locals.activeInventoryId, urlSort, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: false });
                (event.locals as any).activeSort = urlSort;
            } else {
                (event.locals as any).activeSort = event.cookies.get('itemlens_sort_' + event.locals.activeInventoryId) || 'newest';
            }

            // UI View Modes
            (event.locals as any).activeViewMode = event.cookies.get('itemlens_viewmode_' + event.locals.activeInventoryId) || 'list';
            (event.locals as any).activeAddMode = event.cookies.get('itemlens_add_mode') || 'single';

        } else {
            // Destroy the invalid cookie so we don't keep querying a dead token
            event.cookies.delete('session', { path: '/' }); 
        }
    } 
    
    // Now check authorization independently of the cookie's mere existence
    if (!event.locals.user) {
        if (
            path == '/' ||
            /^\/\d/.test(path) ||
            path.startsWith('/search') ||
            path.startsWith('/container') ||
            path.startsWith('/tag') ||
            path.startsWith('/timeline') ||
            path.startsWith('/add') ||
			path.startsWith('/settings')
        ) {
            redirect(303, '/login');
        }
    }

	return await resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('data-theme=""', `data-theme="${theme}"`)
	});
}) satisfies Handle;