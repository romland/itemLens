import { db } from '../src/lib/server/database';
import { computeIdfMap, buildScanContextFromDbItem, computeMatch } from '../src/lib/server/matcher';

async function main() {
    console.log("[Retroactive Flagging] Starting...");
    const inventories = await db.inventory.findMany();

    let flaggedCount = 0;

    for (const inv of inventories) {
        console.log(`[Retroactive Flagging] Processing inventory: ${inv.name}`);
        
        const allItems = await db.item.findMany({
            where: { inventoryId: inv.id },
            include: { attributes: true, locations: { include: { container: true } }, photos: { include: { category: true } } }
        });

        const idfMap = computeIdfMap(allItems);

        for (const item of allItems) {
            // Respect items you have manually dismissed or already flagged
            if (item.duplicateStatus !== 'NONE') continue;

            const scanCtx = buildScanContextFromDbItem(item);
            let hasDuplicate = false;

            for (const dbItem of allItems) {
                if (dbItem.id === item.id) continue;
                
                const match = computeMatch(scanCtx, dbItem, idfMap);
                if (match.isMatch) {
                    hasDuplicate = true;
                    break;
                }
            }

            if (hasDuplicate) {
                await db.item.update({
                    where: { id: item.id },
                    data: { duplicateStatus: 'FLAGGED' }
                });
                flaggedCount++;
                console.log(`[Retroactive Flagging] Flagged item ID ${item.id} ("${item.title}") as duplicate.`);
            }
        }
    }

    console.log(`[Retroactive Flagging] Done! Successfully flagged ${flaggedCount} items.`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});