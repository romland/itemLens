import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import crop from "crop-node";
import { getTopColorsNamed } from '$lib/server/colors';
import { heavyMlQueue } from './queue/index';
import type { Photo } from '@prisma/client';
import type { TaskContext } from '$lib/server/taskManager';
import sharp from 'sharp';

export async function removeBackground(imgUrl: string, outputFileNoBkg: string, tracking?: TaskContext, inputLocalPath?: string, model: string = 'bria-rmbg'): Promise<string> {
    // Allow an explicit input path so we can feed it pre-cropped images, 
    // otherwise fallback to deriving the original path from the output filename.
    const localPath = inputLocalPath || outputFileNoBkg.replace(/_crop\.png$/, '');
    let response;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout to prevent silent queue death

    try {
        if (fs.existsSync(localPath)) {
            const form = new FormData();
            form.append('file', fs.createReadStream(localPath));
            response = await fetch(`http://localhost:7000/api/remove?model=${model}`, {
                method: 'POST',
                body: form as any,
                headers: form.getHeaders(),
                signal: controller.signal as any
            });
        } else {
            console.log(`Local file not found for rembg: ${localPath}, falling back to URL: ${imgUrl}`);
            response = await fetch(`http://localhost:7000/api/remove?url=${encodeURIComponent(imgUrl)}&model=${model}`, { signal: controller.signal as any });
        }
    } catch (e: any) {
        if (e.name === 'AbortError') throw new Error(`RemBG HTTP Error: Request timed out after 60 seconds.`);
        throw e;
    } finally {
        clearTimeout(timeout);
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
}

export async function generatePhotoDerivatives(photo: Partial<Photo>, imgUrl: string, getColors: boolean = true, tracking?: TaskContext, foregroundBox?: number[] | null, bgRemovalEnabled: boolean = true, bgRemovalModel: string = 'bria-rmbg'): Promise<Partial<Photo>> {
    // Monolithic Lock: Prevent fragmented queue interleaving so items finish entirely 1-by-1
    return heavyMlQueue.add(async () => {
        const updates: Partial<Photo> = {};
        const timings: string[] = [];
        let t0 = performance.now();
        
        try {
            const orgThumbnail = await sharp(`static${photo.orgPath}`).resize({ width: 256 }).webp({ quality: 80 }).toBuffer();
            fs.writeFileSync(`static${photo.orgPath?.replace(/\.[^/.]+$/, '')}_org_thumb.webp`, orgThumbnail);
            timings.push(`OrgThumb: ${(performance.now() - t0).toFixed(0)}ms`);
        } catch (ex) { console.error("Error generating original thumbnail", ex); }

        const outputFileNoBkg = `static${photo.orgPath}_crop.png`;
        const finalCropPath = `static${photo.orgPath?.replace(/\.[^/.]+$/, '')}_crop.webp`;
        const finalThumbPath = `static${photo.orgPath?.replace(/\.[^/.]+$/, '')}_thumb.webp`;

        try {
            if (bgRemovalEnabled) {
                let pathForRembg = `static${photo.orgPath}`;
                let tempBoxCrop = null;
                
                if (foregroundBox && foregroundBox.length === 4) {
                    tempBoxCrop = `static${photo.orgPath?.replace(/\.[^/.]+$/, '')}_temp_box.webp`;
                    t0 = performance.now();
                    const extracted = await extractBoundingBox(`static${photo.orgPath}`, foregroundBox, 'temp_box');
                    if (extracted) {
                        pathForRembg = `static${extracted}`;
                    }
                    timings.push(`BoxCrop: ${(performance.now() - t0).toFixed(0)}ms`);
                }

                t0 = performance.now();
            await removeBackground(imgUrl, outputFileNoBkg, tracking, pathForRembg, bgRemovalModel);
                timings.push(`RemBG: ${(performance.now() - t0).toFixed(0)}ms`);

                t0 = performance.now();
                const cropped: any = await crop(outputFileNoBkg, { outputFormat: "png" });
                
                const meta = await sharp(cropped).metadata();
                // If RemBG stripped too much (e.g., tight crop of a patterned shirt), it outputs a tiny/transparent image.
                if (!meta.width || !meta.height || meta.width <= 10 || meta.height <= 10) {
                    console.log(`[Image Processor] RemBG stripped the entire image. Falling back to original.`);
                    await sharp(pathForRembg).webp({ quality: 85 }).toFile(finalCropPath);
                } else {
                    await sharp(cropped).webp({ quality: 85 }).toFile(finalCropPath);
                }
                
                fs.unlinkSync(outputFileNoBkg);
                
                if (tempBoxCrop && fs.existsSync(tempBoxCrop)) {
                    fs.unlinkSync(tempBoxCrop);
                }
                updates.cropPath = `${photo.orgPath?.replace(/\.[^/.]+$/, '')}_crop.webp`;
                timings.push(`AutoCrop&WebP: ${(performance.now() - t0).toFixed(0)}ms`);

                t0 = performance.now();
                await sharp(finalCropPath).resize({ width: 256 }).webp({ quality: 80 }).toFile(finalThumbPath);
                updates.thumbPath = `${photo.orgPath?.replace(/\.[^/.]+$/, '')}_thumb.webp`;
                timings.push(`CutThumb: ${(performance.now() - t0).toFixed(0)}ms`);

                if (getColors) {
                    t0 = performance.now();
                    const colors = await new Promise((resolve, reject) => {
                        getTopColorsNamed(finalCropPath, (err: any, res: any) => err ? reject(err) : resolve(res));
                    });
                    updates.colors = JSON.stringify(colors);
                    timings.push(`Colors: ${(performance.now() - t0).toFixed(0)}ms`);
                }
            } else {
                // Fallback: Just generate thumbnails and colors from the original un-cropped image
                t0 = performance.now();
                await sharp(`static${photo.orgPath}`).resize({ width: 256 }).webp({ quality: 80 }).toFile(finalThumbPath);
                updates.thumbPath = `${photo.orgPath?.replace(/\.[^/.]+$/, '')}_thumb.webp`;
                updates.cropPath = photo.orgPath; // No cutout created
                timings.push(`Thumb(NoBG): ${(performance.now() - t0).toFixed(0)}ms`);

                if (getColors) {
                    t0 = performance.now();
                    const colors = await new Promise((resolve, reject) => {
                        getTopColorsNamed(`static${photo.orgPath}`, (err: any, res: any) => err ? reject(err) : resolve(res));
                    });
                    updates.colors = JSON.stringify(colors);
                    timings.push(`Colors(NoBG): ${(performance.now() - t0).toFixed(0)}ms`);
                }
            }
            
            console.log(`[Image Processor] ⏱️ Sub-task profile for photo ${photo.id || 'N/A'}: ${timings.join(' | ')}`);
            
        } catch (err) { console.error("Background/Crop pipeline failed:", err); }
        return updates;
    }, tracking ? { ...tracking, description: 'Processing image & colors' } : undefined);
}

export async function extractBoundingBox(
    sourceLocalPath: string,
    box: number[],
    filenamePrefix: string = 'crop'
): Promise<string | null> {
    try {
        const { getSafeFilename } = await import('$lib/server/photouploads');
        const { uploadsDiskFolder, uploadsWebFolder } = await import('$lib/server/constants');

        const metadata = await sharp(sourceLocalPath).metadata();
        if (!metadata.width || !metadata.height) return null;

        let top = Math.max(0, Math.floor((box[0] / 1000) * metadata.height));
        let left = Math.max(0, Math.floor((box[1] / 1000) * metadata.width));
        let boxW = Math.max(1, Math.floor(((box[3] - box[1]) / 1000) * metadata.width));
        let boxH = Math.max(1, Math.floor(((box[2] - box[0]) / 1000) * metadata.height));

        if (left + boxW > metadata.width) boxW = metadata.width - left;
        if (top + boxH > metadata.height) boxH = metadata.height - top;

        const filename = getSafeFilename(filenamePrefix, 'crop') + '.webp';
        
        await sharp(sourceLocalPath)
            .extract({ left, top, width: boxW, height: boxH })
            .withMetadata()
            .webp({ quality: 85 })
            .toFile(`${uploadsDiskFolder}/${filename}`);

        return `${uploadsWebFolder}/${filename}`;
    } catch (e) {
        console.error("Bounding box extraction failed", e);
        return null;
    }
}
