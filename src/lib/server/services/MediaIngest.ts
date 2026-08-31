import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto';
import { uploadsDiskFolder, uploadsWebFolder } from '$lib/server/constants';
import { getSafeFilename } from '../fsUtils';

export class MediaIngest {
    /**
     * Standardizes all incoming images into WebP format, bakes in EXIF 
     * rotation (critical for Vision LLMs), generates hashes, and handles disk IO.
     */
    static async saveUploadedImage(
        file: File, 
        prefix: string = 'draft', 
        options?: { maxWidth?: number }
    ) {
        if (!file || !file.size) {
            throw new Error('No file provided or file is empty');
        }

        const rawBuffer = Buffer.from(await file.arrayBuffer());
        const hash = crypto.createHash('sha1').update(rawBuffer).digest('hex');
        
        let pipeline = sharp(rawBuffer).rotate().withMetadata();
        if (options?.maxWidth) {
            pipeline = pipeline.resize({ width: options.maxWidth, withoutEnlargement: true });
        }
        
        const buffer = await pipeline.webp({ quality: 85 }).toBuffer();
        const filename = getSafeFilename(file.name || prefix, prefix) + '.webp';
        const localPath = `${uploadsDiskFolder}/${filename}`;
        const webPath = `${uploadsWebFolder}/${filename}`;
        
        fs.writeFileSync(localPath, buffer);
        
        return { localPath, webPath, hash, mimeType: 'image/webp' };
    }
}