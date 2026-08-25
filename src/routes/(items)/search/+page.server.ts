import type { PageServerLoad, Actions } from "./$types";
import { db } from '$lib/server/database';
import { fail } from '@sveltejs/kit';
import { flagDuplicatesInList } from '$lib/server/matcher';

export const load = (async ({ locals, url, fetch }) => {
    // Forward all URL parameters directly to our master API
    const apiUrl = new URL('/api/items', url.origin);
    url.searchParams.forEach((val, key) => apiUrl.searchParams.append(key, val));
    if (!apiUrl.searchParams.has('c')) apiUrl.searchParams.set('c', '12'); // Ensure standard grid sizing

    const res = await fetch(apiUrl.toString());
    const data = await res.json();

	const categories = await db.category.findMany({
		where: { inventoryId: locals.activeInventoryId },
		orderBy: { name: 'asc' }
	});
	
    return { 
        q: url.searchParams.get('q') || '', 
        cat: url.searchParams.get('category') || '', 
        tag: url.searchParams.get('tag') || '', 
        container: url.searchParams.get('container') || '', 
        unassigned: url.searchParams.get('unassigned') === 'true', 
        titleStr: url.searchParams.get('title') || '', 
        descStr: url.searchParams.get('desc') || '', 
        docStr: url.searchParams.get('doc') || '', 
        reasonStr: url.searchParams.get('reason') || '', 
        minAmount: url.searchParams.get('minAmount') || '', 
        maxAmount: url.searchParams.get('maxAmount') || '', 
        items: data.items, 
        totalCount: data.totalCount, 
        prevPage: data.prevPage, 
        nextPage: data.nextPage, 
        categories 
    };
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
