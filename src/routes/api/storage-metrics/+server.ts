import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';

let cachedMetrics: any = null;
let lastFetch = 0;

async function getDirSize(dirPath: string): Promise<number> {
    let size = 0;
    try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            if (file.isDirectory()) {
                size += await getDirSize(fullPath);
            } else {
                size += (await fs.stat(fullPath)).size;
            }
        }
    } catch (e) {
        // directory might not exist yet
    }
    return size;
}

export async function GET({ locals }) {
    if (!locals.user?.isAdmin) return json({ error: 'Unauthorized' }, { status: 401 });

    // Cache for 5 minutes to prevent aggressive disk I/O
    if (cachedMetrics && Date.now() - lastFetch < 300000) { 
        return json(cachedMetrics);
    }

    try {
        const dbStat = await fs.stat('prisma/dev.db').catch(() => ({ size: 0 }));
        const dbSize = dbStat.size;
        const uploadsSize = await getDirSize('static/images/u');

        cachedMetrics = {
            dbBytes: dbSize,
            uploadsBytes: uploadsSize,
            totalBytes: dbSize + uploadsSize,
        };
        lastFetch = Date.now();

        return json(cachedMetrics);
    } catch (e) {
        return json({ error: 'Failed to calculate storage' }, { status: 500 });
    }
}