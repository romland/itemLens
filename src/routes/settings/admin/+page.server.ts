import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import type { PageServerLoad, Actions } from './$types';

export const load = (async ({ locals }) => {
    if (!locals.user?.isAdmin) throw redirect(303, '/profile');

    const allUsers = await db.user.findMany({ 
        select: { id: true, username: true, name: true, email: true, isAdmin: true, canCreateInventories: true } 
    });

    return { allUsers };
}) satisfies PageServerLoad;

export const actions = {
    createUser: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });
        
        const data = await request.formData();
        const username = data.get('username') as string;
        const password = data.get('password') as string;
        
        if (!username || !password) return fail(400, { error: true, message: "Username and password required." });

        try {
            await db.user.create({
                data: {
                    username: username.trim(),
                    password: await bcrypt.hash(password, 10),
                    token: crypto.randomUUID()
                }
            });
            return { success: true, message: `User '${username}' created!` };
        } catch (e) {
            return fail(400, { error: true, message: "Username likely already exists." });
        }
    },
    
    updateUser: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });

        const data = await request.formData();
        const id = Number(data.get('id'));
        if (!id) return fail(400, { error: true, message: "Invalid User ID." });

        const name = data.get('name') as string;
        const email = data.get('email') as string;
        const password = data.get('password') as string;
        const isAdmin = data.get('isAdmin') === 'true';
        const canCreateInventories = data.get('canCreateInventories') === 'true';

        if (id === locals.user.id && !isAdmin) {
            return fail(400, { error: true, message: "You cannot revoke your own admin status." });
        }

        let updateData: any = { name: name.trim(), email: email.trim(), isAdmin, canCreateInventories };
        if (password && password.trim().length >= 6) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await db.user.update({ where: { id }, data: updateData });

        return { success: true, message: "User updated successfully." };
    }
} satisfies Actions;