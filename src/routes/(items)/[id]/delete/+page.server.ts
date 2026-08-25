import type { Actions} from "./$types";
import { redirect } from "@sveltejs/kit";
import { db } from '$lib/server/database';

export const actions = {
    default: async ({ params, locals }) => {
        await db.item.deleteMany({
            where: {
                id: Number(params.id),
                inventoryId: locals.activeInventoryId
            }
        });

        const { scrubEmptyCategories } = await import('$lib/server/categories');
        scrubEmptyCategories(locals.activeInventoryId).catch(console.error);

        return { deleted: true };
    }
} satisfies Actions;