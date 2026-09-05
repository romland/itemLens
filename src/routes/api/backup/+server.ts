import fs from 'fs';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import path from 'path';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user?.isAdmin) {
        return new Response('Unauthorized - Admin access required', { status: 401 });
    }

    // Dynamically pull the path from the environment, defaulting to dev.db
    let dbPath = env.DATABASE_URL?.replace('file:', '') || './dev.db';
    dbPath = dbPath.split('?')[0]; // Strip off Prisma connection arguments like ?connection_limit=1
    
    // Strictly prevent path traversal by extracting only the target filename
    dbPath = path.basename(dbPath);

    // Prisma resolves relative paths relative to the prisma/ schema directory.
    // If not found in root, check the prisma folder.
    let finalPath = fs.existsSync(path.join('prisma', dbPath)) ? path.join('prisma', dbPath) : dbPath;
    if (!fs.existsSync(finalPath)) return new Response('Database file not found', { status: 404 });

    const fileBuffer = fs.readFileSync(finalPath);
    
    return new Response(fileBuffer, {
        headers: {
            'Content-Type': 'application/vnd.sqlite3',
            'Content-Disposition': `attachment; filename="troves_backup_${Date.now()}.db"`
        }
    });
};