import { PrismaClient } from '@prisma/client';
import { generateDocumentThumbnail } from '../src/lib/server/thumbExtractor.js';
import path from 'path';
import fs from 'fs';

const db = new PrismaClient();

async function main() {
    console.log("Looking for un-thumbnailed documents...");
    const docs = await db.document.findMany({
        where: { thumbPath: null, path: { not: '' } }
    });

    console.log(`Found ${docs.length} documents needing thumbnails.`);

    for (const doc of docs) {
        const localPath = path.join(process.cwd(), 'static', doc.path);
        
        if (!fs.existsSync(localPath)) {
            console.log(`Skipping ${doc.id}: File missing from disk.`);
            continue;
        }

        try {
            if (doc.type === 'video') {
                console.log(`Extracting Video frame for Doc ${doc.id}...`);
                await generateDocumentThumbnail(doc.id, localPath, 'video');
            } 
            else if (doc.path.endsWith('.pdf')) {
                console.log(`Extracting PDF cover for Doc ${doc.id}...`);
                await generateDocumentThumbnail(doc.id, localPath, 'pdf');
            } 
            else if (doc.path.endsWith('.epub')) {
                console.log(`Extracting EPUB cover for Doc ${doc.id}...`);
                await generateDocumentThumbnail(doc.id, localPath, 'epub');
            }
            else if (doc.path.endsWith('.html')) {
                console.log(`Extracting og:image for HTML Doc ${doc.id}...`);
                const htmlContent = fs.readFileSync(localPath, 'utf-8');
                await generateDocumentThumbnail(doc.id, '', 'html', htmlContent);
            }
        } catch (e) {
            console.error(`❌ Failed for Doc ${doc.id}:`, e);
        }
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });