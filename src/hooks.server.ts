import { redirect, type Handle } from "@sveltejs/kit";
import { db } from "$lib/server/database";

export const handle = (async ({ event, resolve }) => {
	let theme: string = 'dracula';  // default theme

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
            select: { id: true, username: true, name: true, email: true, avatar: true }
        });

        if (user) {
            event.locals.user = {
                id: user.id,
                username: user.username,
                name: user.name || user.username,
                email: user.email,
                avatar: user.avatar
            };
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
            path.startsWith('/settings') ||
            path.startsWith('/profile')
        ) {
            redirect(303, '/login');
        }
    }

	return await resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('data-theme=""', `data-theme="${theme}"`)
	});
}) satisfies Handle;