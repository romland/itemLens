import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';

export const load = (async () => {
    const logs = await db.activityLog.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' },
        include: {
            item: {
                select: { id: true, title: true, slug: true }
            }
        }
    });

    return { logs };
}) satisfies PageServerLoad;