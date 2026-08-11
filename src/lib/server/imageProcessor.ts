import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import crop from "crop-node";
import imageThumbnail from 'image-thumbnail';
import { getTopColorsNamed } from '$lib/server/colors';
import { heavyMlQueue } from './queue/index';
import type { Photo } from '@prisma/client';

export async function removeBackground(imgUrl: string, outputFileNoBkg: string): Promise<string> {
    return heavyMlQueue.add(async () => {
        const localPath = outputFileNoBkg.replace(/_crop\.png$/, '');
        let response;
        if (fs.existsSync(localPath)) {
            const form = new FormData();
            form.append('file', fs.createReadStream(localPath));
            response = await fetch('http://localhost:7000/api/remove', {
                method: 'POST',
                body: form,
                headers: form.getHeaders()
            });
        } else {
            console.log(`Local file not found for rembg: ${localPath}, falling back to URL: ${imgUrl}`);
            response = await fetch(`http://localhost:7000/api/remove?url=${encodeURIComponent(imgUrl)}`);
        }

        if (!response || !response.ok) {
            throw new Error(`RemBG HTTP Error: ${response ? await response.text() : 'No response'}`);
        }

        const fileStream = fs.createWriteStream(outputFileNoBkg);
        await new Promise((resolve, reject) => {
            response.body?.pipe(fileStream);
            response.body?.on('error', reject);
            fileStream.on('finish', () => resolve(true));
        });
        return outputFileNoBkg;
    });
}

export async function generatePhotoDerivatives(photo: Partial<Photo>, imgUrl: string, getColors: boolean = true): Promise<Partial<Photo>> {
    const updates: Partial<Photo> = {};
    const thumbOptions = { width: 256, responseType: 'buffer' as const, jpegOptions: { force: true, quality: 90 } };
    
    try {
        const orgThumbnail = await heavyMlQueue.add(() => imageThumbnail(`static${photo.orgPath}`, thumbOptions as any));
        fs.writeFileSync(`static${photo.orgPath}_org_thumb.jpg`, orgThumbnail);
        // updates.thumbPath = `${photo.orgPath}_org_thumb.jpg`;
    } catch (ex) { console.error("Error generating original thumbnail", ex); }

    const outputFileNoBkg = `static${photo.orgPath}_crop.png`;
    try {
        await removeBackground(imgUrl, outputFileNoBkg);
        const cropped = await heavyMlQueue.add(() => crop(outputFileNoBkg, { outputFormat: "png" }));
        fs.writeFileSync(outputFileNoBkg, cropped);
        updates.cropPath = `${photo.orgPath}_crop.png`;

        const thumbnail = await heavyMlQueue.add(() => imageThumbnail(outputFileNoBkg, thumbOptions as any));
        fs.writeFileSync(`static${photo.orgPath}_thumb.jpg`, thumbnail);
        updates.thumbPath = `${photo.orgPath}_thumb.jpg`;

        if (getColors) {
            const colors = await heavyMlQueue.add(() => new Promise((resolve, reject) => {
                getTopColorsNamed(outputFileNoBkg, (err: any, res: any) => err ? reject(err) : resolve(res));
            }));
            updates.colors = JSON.stringify(colors);
        }
    } catch (err) { console.error("Background/Crop pipeline failed:", err); }
    return updates;
}