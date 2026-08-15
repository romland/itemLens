import type { PageServerLoad, Actions } from "./$types";
import { db } from '$lib/server/database';
import { fail } from '@sveltejs/kit';

export const load = (async ({ locals, url }) => {
	const q = (url.searchParams.get('q') || '').trim();
	const cat = (url.searchParams.get('category') || '').trim();
	const tag = (url.searchParams.get('tag') || '').trim();
	const container = (url.searchParams.get('container') || '').trim();
	const unassigned = url.searchParams.get('unassigned') === 'true';
	const titleStr = (url.searchParams.get('title') || '').trim();
	const descStr = (url.searchParams.get('desc') || '').trim();
	const docStr = (url.searchParams.get('doc') || '').trim();
	const reasonStr = (url.searchParams.get('reason') || '').trim();
	const minAmount = url.searchParams.get('minAmount') || '';
	const maxAmount = url.searchParams.get('maxAmount') || '';
    const page = Number(url.searchParams.get('page') ?? '1');

	const whereClause: any = { inventoryId: locals.activeInventoryId };

	if (q) {
		whereClause.OR = [
			{ title: { contains: q }},
			{ description: { contains: q }},
			{ locations: { some: { container: { name: { contains: q } } } } }
		];
	}
	if (cat) {
		whereClause.photos = { some: { category: { name: cat } } };
	}
	if (tag) {
		whereClause.tags = { some: { name: tag } };
	}
	if (container) {
		whereClause.locations = { some: { container: { name: container } } };
	}
	if (unassigned) {
		whereClause.locations = { none: {} };
	}
	if (titleStr) whereClause.title = { contains: titleStr };
	if (descStr) whereClause.description = { contains: descStr };
	if (reasonStr) whereClause.reason = { contains: reasonStr };
	if (docStr) {
		whereClause.documents = {
			some: {
				OR: [
					{ title: { contains: docStr } },
					{ extracts: { contains: docStr } },
					{ summary: { contains: docStr } }
				]
			}
		};
	}
	if (minAmount || maxAmount) {
		whereClause.amount = {};
		if (minAmount) whereClause.amount.gte = Number(minAmount);
		if (maxAmount) whereClause.amount.lte = Number(maxAmount);
	}

	const [items, totalCount] = await Promise.all([
		db.item.findMany({
			where: whereClause,
			take: 10,
			skip: page == 1 ? 0 : (page - 1) * 10,
			orderBy: [{ id: 'desc'}],
			include: {
				locations: {
					include: { 	
						container: true,
					}
				},
				"photos" : true,
				"tags" : true,
				"documents": true,      // a bit wasteful as I really only need the count()
			}
		}),
		db.item.count({ where: whereClause })
	]);

	const categories = await db.category.findMany({
		where: { inventoryId: locals.activeInventoryId },
		orderBy: { name: 'asc' }
	});
	
    const prevPage = page == 1 ? 0 : page - 1;
    const nextPage = items.length < 10 ? 0 : page + 1;

	return { q, cat, tag, container, unassigned, titleStr, descStr, docStr, reasonStr, minAmount, maxAmount, items, totalCount, prevPage, nextPage, categories };
}) satisfies PageServerLoad;

export const actions = {
	bulkEdit: async ({ request, locals }) => {
		const data = await request.formData();
		const itemIds = data.getAll('itemIds[]').map(Number);
		const action = data.get('bulkAction') as string;
		const value = data.get('bulkValue') as string;

		if (itemIds.length === 0) return fail(400, { message: 'No items selected' });
		if (!value || value.trim() === '') return fail(400, { message: 'Value cannot be empty' });

		if (action === 'addTag') {
			const { getTagIds } = await import('$lib/server/services');
			const tagIds = await getTagIds(value, locals.activeInventoryId);
			for (const id of itemIds) {
				await db.item.update({ where: { id }, data: { tags: { connect: tagIds } } });
			}
		} else if (action === 'removeTag') {
			const tag = await db.tag.findFirst({ where: { name: value.trim(), inventoryId: locals.activeInventoryId } });
			if (tag) {
				for (const id of itemIds) {
					await db.item.update({ where: { id }, data: { tags: { disconnect: { id: tag.id } } } });
				}
			}
		} else if (action === 'addContainer') {
			const container = await db.container.findFirst({ where: { name: value.trim(), inventoryId: locals.activeInventoryId }});
			if (container) {
				for (const id of itemIds) {
					await db.itemsInContainer.upsert({
						where: { itemId_containerId: { itemId: id, containerId: container.id } },
						create: { itemId: id, containerId: container.id },
						update: {}
					});
				}
			}
		} else if (action === 'removeContainer') {
			const container = await db.container.findFirst({ where: { name: value.trim(), inventoryId: locals.activeInventoryId }});
			if (container) {
				await db.itemsInContainer.deleteMany({
					where: { itemId: { in: itemIds }, containerId: container.id }
				});
			}
		} else if (action === 'setCategory') {
			const { getOrCreateCategory } = await import('$lib/server/categories');
			const cat = await getOrCreateCategory(value.trim(), locals.activeInventoryId);
			await db.photo.updateMany({
				where: { itemId: { in: itemIds } },
				data: { categoryId: cat.id }
			});
		}

		return { success: true };
	}
} satisfies Actions;
