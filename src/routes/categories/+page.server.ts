import { db } from '$lib/server/database';
import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import slugify from 'slugify';

export const load = (async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const categories = await db.category.findMany({
        where: { inventoryId: locals.activeInventoryId },
        include: {
            _count: {
                select: { photos: true }
            }
        },
        orderBy: { name: 'asc' }
    });

    return { categories };
}) satisfies PageServerLoad;

export const actions = {
    create: async ({ request, locals }) => {
        const data = await request.formData();
        const rawName = data.get('name')?.toString();
        
        if (!rawName || !rawName.trim()) {
            return fail(400, { message: 'Category name is required.' });
        }
        
        const name = rawName.trim().toLowerCase();
        const slug = slugify(name);

        await db.category.upsert({
            where: { inventoryId_slug: { inventoryId: locals.activeInventoryId, slug } },
            update: {},
            create: { name, slug, inventoryId: locals.activeInventoryId }
        });
    },
    delete: async ({ request, locals }) => {
        const data = await request.formData();
        const id = Number(data.get('id'));
        if (id) {
            const category = await db.category.findUnique({
                where: { id, inventoryId: locals.activeInventoryId },
                include: { photos: true }
            });

            if (category) {
                // 1. Wipe the hardcoded subCategory from the JSON so the UI stops rendering it as a "ghost"
                for (const photo of category.photos) {
                    if (photo.llmAnalysis) {
                        try {
                            const analysis = JSON.parse(photo.llmAnalysis);
                            if (analysis.subCategory === category.name) {
                                delete analysis.subCategory;
                                await db.photo.update({
                                    where: { id: photo.id },
                                    data: { llmAnalysis: JSON.stringify(analysis) }
                                });
                            }
                        } catch (e) {}
                    }
                }
                // 2. Delete the category (Prisma automatically sets categoryId to null on the Photos table)
               await db.category.delete({ where: { id } });
            }
        }
    }
} satisfies Actions;