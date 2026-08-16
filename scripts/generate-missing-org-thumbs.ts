// FILE: scripts/generate-missing-org-thumbs.ts
import fs from 'fs';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Fetching photos from database...");
    const photos = await prisma.photo.findMany({
        where: { orgPath: { not: null } }
    });

    console.log(`Found ${photos.length} photos. Checking for missing original thumbnails...`);
    let count = 0;

    for (const photo of photos) {
        if (!photo.orgPath) continue;

        const localOrgPath = `static${photo.orgPath}`;
        
        // Strip the extension and append the clean WebP suffix
        const localOrgThumbPath = localOrgPath.replace(/\.[^/.]+$/, '_org_thumb.webp');

        if (!fs.existsSync(localOrgThumbPath)) {
            if (fs.existsSync(localOrgPath)) {
                // Skip video files since sharp cannot process them
                if (localOrgPath.match(/\.(mp4|webm|mov|ogg|mkv|json)$/i)) continue;

                console.log(`Generating missing WebP thumb for: ${photo.orgPath}`);
                try {
                    await sharp(localOrgPath)
                        .resize({ width: 256 })
                        .webp({ quality: 80 })
                        .toFile(localOrgThumbPath);
                    count++;
                } catch (err) {
                    console.error(`Failed to generate thumb for ${localOrgPath}:`, err);
                }
            } else {
                console.warn(`Original file not found on disk: ${localOrgPath}`);
            }
        }
    }

    console.log(`Done! Generated ${count} missing WebP thumbnails.`);
}

main()
    .then(async () => await prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });