import { db } from '$lib/server/database';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function escapeCSV(val: any): string {
    if (val === null || val === undefined) return '';
    let str = String(val);
    
    // CSV Injection Protection: Mitigate formula execution in Excel/Google Sheets
    if (/^[=+\-@]/.test(str)) {
        str = "'" + str;
    }
    
    // If the value contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const data = await request.json();
    const { itemIds, config } = data;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return new Response('No items selected', { status: 400 });
    }

    const items = await db.item.findMany({
        where: {
            id: { in: itemIds },
            inventoryId: locals.activeInventoryId
        },
        include: {
            attributes: true,
            tags: true,
            locations: { include: { container: true } },
            photos: true
        },
        orderBy: { id: 'desc' }
    });

    const headers = ['ID'];
    if (config.core) headers.push('Title', 'Description', 'Quantity', 'Reason', 'Duplicate Status', 'Created At', 'Updated At');
    if (config.locs) headers.push('Locations');
    if (config.tags) headers.push('Tags');
    if (config.images) headers.push('Primary Image URL');

    // Dynamically find all unique attribute keys present across the selected items
    let attrKeys: string[] = [];
    if (config.attrs) {
        const keysSet = new Set<string>();
        items.forEach(item => {
            item.attributes.forEach(attr => keysSet.add(attr.key));
        });
        attrKeys = Array.from(keysSet).sort();
        headers.push(...attrKeys.map(k => k.replace(/_/g, ' '))); // Make headers readable
    }

    const rows = [headers.map(escapeCSV).join(',')];
    const origin = new URL(request.url).origin;

    for (const item of items) {
        const row = [escapeCSV(item.id)];
        
        if (config.core) {
            row.push(
                escapeCSV(item.title),
                escapeCSV(item.description),
                escapeCSV(item.amount),
                escapeCSV(item.reason),
                escapeCSV(item.duplicateStatus),
                escapeCSV(item.createdAt.toISOString()),
                escapeCSV(item.updatedAt.toISOString())
            );
        }

        if (config.locs) {
            row.push(escapeCSV(item.locations.map(l => l.container.name).join(', ')));
        }

        if (config.tags) {
            row.push(escapeCSV(item.tags.map(t => t.name).join(', ')));
        }

        if (config.images) {
            const primaryPhoto = item.photos.find(p => p.type === 'product') || item.photos[0];
            const imgPath = primaryPhoto?.orgPath ? `${origin}${primaryPhoto.orgPath}` : '';
            row.push(escapeCSV(imgPath));
        }

        if (config.attrs) {
            const attrMap = new Map(item.attributes.map(a => [a.key, a.value]));
            attrKeys.forEach(k => {
                row.push(escapeCSV(attrMap.get(k) || ''));
            });
        }

        rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');

    return new Response(csvContent, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="troves_export_${new Date().toISOString().split('T')[0]}.csv"`
        }
    });
};