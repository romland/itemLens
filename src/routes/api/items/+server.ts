/*
Doc: https://kit.svelte.dev/docs/routing#server
*/
import { db } from '$lib/server/database';

/*
TODO SECURITY: NEED TO IMPLEMENT AUTHORIZATION HERE (HOW IS IT DONE ELSEWHERE?)
*/

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
    const q = String(url.searchParams.get('q') || "").trim();
    const page = Number(url.searchParams.get('page') ?? '1');
    const count = Math.min( Number(url.searchParams.get('c') ?? '10'), 15);

    const query = {
        take: count,
        skip: page == 1 ? 0 : (page - 1) * count,
        orderBy: [{ id: 'desc'}],
        include: {
            locations: {
                include: {  
                    container: true,
                }
            },
            "photos" : true,
            "tags" : true,
            "documents": true,      // a bit wasteful as I really only need the count()
        }
    };

    if(q && q.length > 0) {
        query.where = {
            OR: [
                { title: { contains: q }},
                { description: { contains: q }}
            ],
            // AND: [
            //     { authorId: locals.user.id },
            // ]
        };
    }

    const items = await db.item.findMany(query);

    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < count ? 0 : page + 1;

    return new Response(JSON.stringify({ q, items, prevPage, nextPage }));
}
