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
        if (!locals.user) return fail(401, { message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { message: 'Forbidden. Viewer access only.' });

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
    updateStrategy: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { message: 'Forbidden. Viewer access only.' });

        const data = await request.formData();
        const id = Number(data.get('id'));
        const strategy = data.get('strategy')?.toString();
        
        if (id && strategy) {
            await db.category.update({
                where: { id, inventoryId: locals.activeInventoryId },
                data: { duplicateStrategy: strategy }
            });
        }
    },
    delete: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { message: 'Forbidden. Viewer access only.' });

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
    },
    merge: async ({ request, locals }) => {
        if (!locals.user) return fail(401, { message: 'Unauthorized' });
        if (locals.role !== 'EDITOR' && locals.role !== 'OWNER' && !locals.user.isAdmin) return fail(403, { message: 'Forbidden. Viewer access only.' });

        const data = await request.formData();
        const sourceId = Number(data.get('sourceId'));
        const targetId = Number(data.get('targetId'));

        if (sourceId && targetId && sourceId !== targetId) {
            const targetCategory = await db.category.findUnique({ where: { id: targetId, inventoryId: locals.activeInventoryId } });
            const sourceCategory = await db.category.findUnique({ where: { id: sourceId, inventoryId: locals.activeInventoryId }, include: { photos: true } });

            if (targetCategory && sourceCategory) {
                // 1. MIGRATE TAXONOMY RULES (TemplateFields)
                const sourceFields = await db.templateField.findMany({ where: { categoryId: sourceId } });
                const targetFields = await db.templateField.findMany({ where: { categoryId: targetId } });

                for (const sField of sourceFields) {
                    const tField = targetFields.find(f => f.name === sField.name);
                    if (tField) {
                        // Collision: Merge enum options if both are enums
                        if (sField.type === 'enum' && tField.type === 'enum') {
                            let sOpts = [], tOpts = [];
                            try { if (sField.options) sOpts = JSON.parse(sField.options); } catch(e){}
                            try { if (tField.options) tOpts = JSON.parse(tField.options); } catch(e){}
                            
                            const mergedOpts = [...new Set([...tOpts, ...sOpts])];
                            await db.templateField.update({
                                where: { id: tField.id },
                                data: { options: JSON.stringify(mergedOpts) }
                            });
                        }
                        // Delete the redundant source field
                        await db.templateField.delete({ where: { id: sField.id } });
                    } else {
                        // No collision: Just move the rule to the target category
                        await db.templateField.update({
                            where: { id: sField.id },
                            data: { categoryId: targetId }
                        });
                    }
                }

                // 2. MIGRATE PHOTOS
                await db.photo.updateMany({
                    where: { categoryId: sourceId },
                    data: { categoryId: targetId }
                });

                // 3. REWRITE AI CACHES
                for (const photo of sourceCategory.photos) {
                    if (photo.llmAnalysis) {
                        try {
                            const analysis = JSON.parse(photo.llmAnalysis);
                            if (analysis.subCategory === sourceCategory.name) {
                                analysis.subCategory = targetCategory.name;
                                await db.photo.update({ where: { id: photo.id }, data: { llmAnalysis: JSON.stringify(analysis) } });
                            }
                        } catch (e) {}
                    }
                }

                // 4. VAPORIZE OLD CATEGORY
                await db.category.delete({ where: { id: sourceId } });
            }
        }
    }
} satisfies Actions;
