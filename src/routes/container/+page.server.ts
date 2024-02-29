import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { fail, redirect } from "@sveltejs/kit";

export const load = (async ({ locals, params }) => {

    const containers = await db.container.findMany({
        select : {
          name : true,
          parentId : true,
          photoPath : true,
          description : true,
          location : true,
          children : {
            select : {
              name : true,
              parentId : true,
            }
          },
        },
        where: {
            AND: [
                { parentId: null }
            ]
        },
        orderBy: {
          name : "asc"
        }
    });
  
    if (!containers) {
        return fail(400, {
            error: true,
            message: '<strong>Container</strong> not found.'
        });
    }

    return {
        containers: containers
    };
}) satisfies PageServerLoad;
