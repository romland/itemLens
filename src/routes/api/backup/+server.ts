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

    // Prisma resolves relative paths relative to the prisma/ schema directory.
    // If not found in root, check the prisma folder.
    if (!fs.existsSync(dbPath) && fs.existsSync(path.join('prisma', dbPath))) {
        dbPath = path.join('prisma', dbPath);
    }

    const fileBuffer = fs.readFileSync(dbPath);
    
    return new Response(fileBuffer, {
        headers: {
            'Content-Type': 'application/vnd.sqlite3',
            'Content-Disposition': `attachment; filename="itemLens_backup_${Date.now()}.db"`
        }
    });
};