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

        redirect(302, '/');
    }
} satisfies Actions;