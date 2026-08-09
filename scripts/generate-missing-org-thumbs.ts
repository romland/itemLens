import fs from 'fs';
import imageThumbnail from 'image-thumbnail';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Fetching photos from database...");
    const photos = await prisma.photo.findMany({
        where: { orgPath: { not: null } }
    });

    console.log(`Found ${photos.length} photos. Checking for missing original thumbnails...`);
    let count = 0;

    const thumbOptions = {
        width: 256,
        responseType: 'buffer',
        jpegOptions: { force: true, quality: 90 }
    };

    for (const photo of photos) {
        if (!photo.orgPath) continue;

        const localOrgPath = `static${photo.orgPath}`;
        const localOrgThumbPath = `${localOrgPath}_org_thumb.jpg`;

        if (!fs.existsSync(localOrgThumbPath)) {
            if (fs.existsSync(localOrgPath)) {
                console.log(`Generating missing thumb for: ${photo.orgPath}`);
                try {
                    const thumbnail = await imageThumbnail(localOrgPath, thumbOptions as any);
                    fs.writeFileSync(localOrgThumbPath, thumbnail);
                    count++;
                } catch (err) {
                    console.error(`Failed to generate thumb for ${localOrgPath}:`, err);
                }
            } else {
                console.warn(`Original file not found on disk: ${localOrgPath}`);
            }
        }
    }

    console.log(`Done! Generated ${count} missing thumbnails.`);
}

main()
    .then(async () => await prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });