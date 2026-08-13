/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Get the container name from the command line arguments
    const containerName = process.argv[2];

    if (!containerName) {
        console.error('❌ Error: Please provide a container name.');
        console.error('👉 Usage: npx tsx scripts/empty-container.ts "Container Name"');
        process.exit(1);
    }

    console.log(`🔍 Finding items in container: "${containerName}"...`);

    // 1. Find the IDs of all items resting in this container
    const itemsInContainer = await prisma.itemsInContainer.findMany({
        where: { containerName: containerName },
        select: { itemId: true }
    });

    if (itemsInContainer.length === 0) {
        console.log(`✅ No items found in "${containerName}". Nothing to delete.`);
        process.exit(0);
    }

    const itemIds = itemsInContainer.map(i => i.itemId);

    console.log(`🗑️ Found ${itemIds.length} items. Deleting from database...`);

    // 2. Delete the actual Items.
    // (Prisma's onDelete: Cascade will automatically clean up Locations, Photos, Docs, etc.)
    const deleteResult = await prisma.item.deleteMany({
        where: {
            id: { in: itemIds }
        }
    });

    console.log(`🎉 Successfully deleted ${deleteResult.count} items!`);
}

main()
    .catch(e => {
        console.error('❌ A fatal error occurred:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });