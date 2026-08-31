import { PrismaClient } from '@prisma/client';
import { processEpubCoverToItemPhoto } from '../src/lib/server/epub.js';
import path from 'path';

const db = new PrismaClient();

async function main() {
    console.log("Looking for EPUB documents in the database...");
    const docs = await db.document.findMany({
        where: { path: { endsWith: '.epub' }, itemId: { not: null } }
    });

    console.log(`Found ${docs.length} EPUB documents attached to items.`);

    for (const doc of docs) {
        if (!doc.itemId) continue;

        // Skip if the item already has a primary cover to prevent overriding custom art
        const existingPhotos = await db.photo.count({
            where: { itemId: doc.itemId, type: 'product' }
        });

        if (existingPhotos > 0) {
            console.log(`Item ${doc.itemId} already has photos. Skipping to prevent overriding.`);
            continue;
        }

        const localPath = path.join(process.cwd(), 'static', doc.path);
        console.log(`Extracting cover for Item ${doc.itemId} from ${localPath}`);
        try {
            await processEpubCoverToItemPhoto(doc.itemId, localPath);
            console.log(`✅ Success for Item ${doc.itemId}`);
        } catch (e) {
            console.error(`❌ Failed for Item ${doc.itemId}:`, e);
        }
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });