// This is completely harmless to run, the index will be rebuilt when we start up server again
import Database from 'better-sqlite3';
import path from 'path';

/**
 * Prisma does not support SQLite Virtual Tables (FTS5) or custom triggers.
 * This script safely removes them before `prisma db push` runs, preventing crashes.
 * The application will automatically rebuild them on boot via `initFTS()`.
 */
try {
    const dbPath = path.resolve(process.cwd(), 'prisma/dev.db');
    const db = new Database(dbPath);
    
    db.exec(`
        DROP TRIGGER IF EXISTS Document_ai;
        DROP TRIGGER IF EXISTS Document_ad;
        DROP TRIGGER IF EXISTS Document_au;
        DROP TABLE IF EXISTS DocumentIndex;
    `);
    
    console.log('✅ [Pre-Push] Safely cleared FTS5 tables and triggers for Prisma compatibility.');
    db.close();
} catch (e: any) {
    console.warn(`⚠️ [Pre-Push] Could not drop FTS tables (${e.message}). Skipping.`);
}