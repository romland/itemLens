import { db } from '../src/lib/server/database';
import { extractEpubText } from '../src/lib/server/epub';
import { uploadsDiskFolder, uploadsWebFolder } from '../src/lib/server/constants';
import fs from 'fs';
import path from 'path';

async function main() {
    console.log("Looking for existing EPUB documents in the database...");
    
    // Find all documents where the path ends in .epub
    const epubs = await db.document.findMany({
        where: {
            path: { endsWith: '.epub' }
        }
    });

    console.log(`Found ${epubs.length} EPUB(s) to process.\n`);

    for (const doc of epubs) {
        console.log(`Processing [ID: ${doc.id}] ${doc.title || doc.path}`);
        
        // Translate the web path (e.g. /images/u/file.epub) to the local disk path
        const filename = doc.path.replace(`${uploadsWebFolder}/`, '');
        const localPath = path.join(uploadsDiskFolder, filename);

        if (!fs.existsSync(localPath)) {
            console.warn(`  -> [SKIP] File not found on disk: ${localPath}\n`);
            continue;
        }

        try {
            const extractedText = await extractEpubText(localPath);
            if (!extractedText) {
                console.warn(`  -> [SKIP] No text extracted.\n`);
                continue;
            }

            // Give SQLite the ENTIRE text for the Full-Text Search index!
            await db.document.update({
                where: { id: doc.id },
                data: {
                    extracts: JSON.stringify([extractedText])
                }
            });
            console.log(`  -> [SUCCESS] Indexed ${extractedText.length} characters for FTS5.\n`);
        } catch (e) {
            console.error(`  -> [ERROR] Failed to process:`, e);
        }
    }

    console.log("Done indexing existing EPUBs.");
}

main().catch(console.error).finally(() => process.exit(0));