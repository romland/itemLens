import type { Actions} from "./$types";
import { redirect } from "@sveltejs/kit";
import { db } from '$lib/server/database';

export const actions = {
    default: async ({ params }) => {
        await db.item.delete({
            where: {
                id: Number(params.id)
            }
        });

        redirect(302, '/');
    }
} satisfies Actions;