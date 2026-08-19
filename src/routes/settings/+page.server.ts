import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import sharp from 'sharp';
import { bootstrapInventorySchema } from '$lib/server/ontology';

export const load = async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    let allUsers = [];
	let allInventories = [];
    let accessMap = [];

    if (locals.user.isAdmin) {
        allUsers = await db.user.findMany({ select: { id: true, username: true, name: true, email: true, isAdmin: true } });
		allInventories = await db.inventory.findMany({ 
            select: { 
                id: true, 
                name: true,
                allowNewCategories: true,
                allowAutoTaxonomy: true,
                extractExif: true,
                deepScanCollections: true,
                duplicateStrategy: true,
                _count: { select: { items: true, notes: true, containers: true } }
            } 
        });
        accessMap = await db.userInventoryAccess.findMany({
            include: { user: { select: { username: true } }, inventory: { select: { name: true } } }
        });
    }

	return { allUsers, allInventories, accessMap };
};

export const actions = {
	updateProfile: async ({ locals, request }) => {
		const data = await request.formData();
		const name = data.get('name') as string;
		const email = data.get('email') as string;
		const avatarFile = data.get('avatar') as File;

		let updateData: any = { name, email };

		if (avatarFile && avatarFile.size > 0) {
			const buffer = Buffer.from(await avatarFile.arrayBuffer());
              const filename = `avatar-${locals.user.id}-${Date.now()}.webp`;
              await sharp(buffer).webp({ quality: 85 }).toFile(`${uploadsDiskFolder}/${filename}`);
			updateData.avatar = `${uploadsWebFolder}/${filename}`;
		}

		await db.user.update({
			where: { id: locals.user.id },
			data: updateData
		});

		return { success: true, message: 'Profile updated successfully.' };
	},

	updatePassword: async ({ locals, request }) => {
		const data = await request.formData();
		const password = data.get('password') as string;

		if (!password || password.length < 6) {
			return fail(400, { error: true, message: 'Password must be at least 6 characters.' });
		}

		await db.user.update({
			where: { id: locals.user.id },
			data: { password: await bcrypt.hash(password, 10) }
		});

		return { success: true, message: 'Password changed successfully.' };
	},

	createInventory: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { error: true, message: "Unauthorized" });
        
        const data = await request.formData();
        const name = data.get('name') as string;
        const archetype = (data.get('archetype') as string) || "generic";
        const customArchetype = data.get('customArchetype') as string;

		if (!name || name.trim() === '') return fail(400, { error: true, message: "Inventory name required." });

        const finalArchetype = archetype === 'other' ? (customArchetype || 'generic') : archetype;        

        const inventory = await db.inventory.create({
            data: {
                name: name.trim(),
				description: "User created inventory",
                classes: "[]",
                archetype: archetype,
                users: { create: { userId: locals.user.id, role: "OWNER" } }
            }
        });

        // Fire and forget with internal retry protection
        bootstrapInventorySchema(inventory.id, `${inventory.name} (${finalArchetype})`)
            .catch(e => console.error("Initial schema bootstrap failed, use manual retry in settings.", e));



		return { success: true, message: `Inventory '${inventory.name}' created!` };
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

    toggleAutoCategories: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });

        const data = await request.formData();
        const id = Number(data.get('id'));
        const allow = data.get('allowNewCategories') === 'true';
        await db.inventory.update({ where: { id }, data: { allowNewCategories: allow } });
        return { success: true, message: "Category generation settings updated." };
    },

    toggleAutoTaxonomy: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });
        const data = await request.formData();
        const id = Number(data.get('id'));
        const allow = data.get('allowAutoTaxonomy') === 'true';
        await db.inventory.update({ where: { id }, data: { allowAutoTaxonomy: allow } as any });
        return { success: true, message: "AI Taxonomy settings updated." };
    },

    toggleExtractExif: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });

        const data = await request.formData();
        const id = Number(data.get('id'));
        const allow = data.get('extractExif') === 'true';
        await db.inventory.update({ where: { id }, data: { extractExif: allow } });
        return { success: true, message: "EXIF extraction settings updated." };
    },

    toggleDeepScan: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });
        const data = await request.formData();
        const id = Number(data.get('id'));
        const allow = data.get('deepScan') === 'true';
        await db.inventory.update({ where: { id }, data: { deepScanCollections: allow } });
        return { success: true, message: "Collection scanning settings updated." };
    },

    updateInventoryStrategy: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });
        const data = await request.formData();
        const id = Number(data.get('id'));
        const strategy = data.get('strategy')?.toString();
        if (id && strategy) {
            await db.inventory.update({ where: { id }, data: { duplicateStrategy: strategy } });
        }
        return { success: true, message: "Default duplicate strategy updated." };
    },

    retrySchemaBootstrap: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });
        const data = await request.formData();
        const inventoryId = Number(data.get('inventoryId'));
        const name = data.get('name') as string;

        if (!inventoryId) return fail(400, { error: true, message: "Invalid ID." });
        await bootstrapInventorySchema(inventoryId, name);
        return { success: true, message: `Taxonomy rules regenerated for '${name}'!` };
    },

	deleteInventory: async ({ request, locals }) => {
        if (!locals.user?.isAdmin) return fail(403, { error: true, message: "Forbidden. Admins only." });

        const data = await request.formData();
        const id = Number(data.get('id'));
        const confirmName = data.get('confirmName') as string;

        if (!id) return fail(400, { error: true, message: "Invalid ID." });

        const vault = await db.inventory.findUnique({ where: { id } });
		if (!vault) return fail(404, { error: true, message: "Inventory not found." });

        if (vault.name !== confirmName) return fail(400, { error: true, message: "Confirmation name did not match." });


        await db.inventory.delete({ where: { id } });
		return { success: true, message: `Inventory '${vault.name}' and all its contents completely deleted.` };
    },

    setTheme: async ({ url, cookies }) => {
    }
}
