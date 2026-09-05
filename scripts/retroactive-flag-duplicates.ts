import { db } from '../src/lib/server/database';
import { computeIdfMap, buildScanContextFromDbItem, computeMatch } from '../src/lib/server/matcher';

async function main() {
    console.log("[Retroactive Flagging] Starting...");

    // 1. Reset all currently FLAGGED items back to NONE. 
    // We DO NOT touch 'DISMISSED' items, as you explicitly marked those as "not duplicates".
    const resetInfo = await db.item.updateMany({
        where: { duplicateStatus: 'FLAGGED' },
        data: { duplicateStatus: 'NONE' }
    });
    console.log(`[Retroactive Flagging] Cleared ${resetInfo.count} previously flagged items.`);

    const inventories = await db.inventory.findMany();
    let flaggedCount = 0;

    for (const inv of inventories) {
        console.log(`[Retroactive Flagging] Processing Trove: ${inv.name} (Archetype: ${inv.archetype})`);
        
        const allItems = await db.item.findMany({
            where: { inventoryId: inv.id },
            include: { attributes: true, locations: { include: { container: true } }, photos: { include: { category: true } } }
        });

        const idfMap = computeIdfMap(allItems);

        for (const item of allItems) {
            // Respect items you have manually dismissed
            if (item.duplicateStatus === 'DISMISSED') continue;

            // Pass the archetype down so the engine knows to use Strict Media logic vs Fuzzy Apparel logic
            const scanCtx = buildScanContextFromDbItem(item, inv.archetype);
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
            }
        }
    }

    console.log(`[Retroactive Flagging] Done! Identified ${flaggedCount} true duplicates under the new engine.`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});