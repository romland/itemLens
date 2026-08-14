import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import bcrypt from 'bcrypt';
import crypto from "crypto";

export const load = async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    let allUsers = [];
    let allVaults = [];
    let accessMap = [];

    if (locals.user.isAdmin) {
        allUsers = await db.user.findMany({ select: { id: true, username: true, name: true, email: true, isAdmin: true } });
        allVaults = await db.inventory.findMany({ 
            select: { 
                id: true, 
                name: true,
                _count: { select: { items: true, notes: true, containers: true } }
            } 
        });
        accessMap = await db.userInventoryAccess.findMany({
            include: { user: { select: { username: true } }, inventory: { select: { name: true } } }
        });
    }

    return { allUsers, allVaults, accessMap };
};

export const actions = {
    createVault: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: "Unauthorized" });
        
        const data = await request.formData();
        const name = data.get('name') as string;
        
        if (!name || name.trim() === '') return fail(400, { error: true, message: "Vault name required." });

        const inventory = await db.inventory.create({
            data: {
                name: name.trim(),
                description: "User created vault",
                classes: "[]",
                users: { create: { userId: locals.user.id, role: "OWNER" } }
            }
        });

        return { success: true, message: `Vault '${inventory.name}' created!` };
    },

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

        if (id === locals.user.id && !isAdmin) {
            return fail(400, { error: true, message: "You cannot revoke your own admin status." });
        }

        let updateData: any = { name: name.trim(), email: email.trim(), isAdmin };
        if (password && password.trim().length >= 6) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await db.user.update({ where: { id }, data: updateData });

        return { success: true, message: "User updated successfully." };
    },    
    assignAccess: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });

        const data = await request.formData();
        const userId = Number(data.get('userId'));
        const inventoryId = Number(data.get('inventoryId'));
        const role = data.get('role') as string;

        if (!userId || !inventoryId || !role) return fail(400, { error: true, message: "Missing fields." });

        await db.userInventoryAccess.upsert({
            where: { inventoryId_userId: { inventoryId, userId } },
            update: { role },
            create: { inventoryId, userId, role }
        });

        return { success: true, message: "Access granted successfully." };
    },

    revokeAccess: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });

        const data = await request.formData();
        const userId = Number(data.get('userId'));
        const inventoryId = Number(data.get('inventoryId'));

        await db.userInventoryAccess.deleteMany({
            where: { inventoryId, userId }
        });
        return { success: true, message: "Access revoked." };
    },

    deleteVault: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });

        const data = await request.formData();
        const id = Number(data.get('id'));
        const confirmName = data.get('confirmName') as string;

        if (!id) return fail(400, { error: true, message: "Invalid ID." });

        const vault = await db.inventory.findUnique({ where: { id } });
        if (!vault) return fail(404, { error: true, message: "Vault not found." });

        if (vault.name !== confirmName) return fail(400, { error: true, message: "Confirmation name did not match." });


        await db.inventory.delete({ where: { id } });
        return { success: true, message: `Vault '${vault.name}' and all its contents completely deleted.` };
    },

    setTheme: async ({ url, cookies }) => {
    }
}
