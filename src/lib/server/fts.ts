import { db } from './database';
import { logActivity } from './logger';

let initialized = false;

export async function initFTS() {
    if (initialized) return;
    
    try {
        // Check if the correct table exists by attempting a tiny query
        let needsRebuild = false;
        try {
            await db.$queryRawUnsafe(`SELECT extracts FROM DocumentIndex LIMIT 1`);
        } catch (e) {
            needsRebuild = true;
        }

        if (needsRebuild) {
            console.log("[FTS] Schema mismatch or missing index. Rebuilding tables...");
            
            await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS Document_ai;`);
            await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS Document_ad;`);
            await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS Document_au;`);
            await db.$executeRawUnsafe(`DROP TABLE IF EXISTS DocumentIndex;`);

            // 1. Create the Virtual Index Table
            await db.$executeRawUnsafe(`
                CREATE VIRTUAL TABLE DocumentIndex USING fts5(
                    title,
                    extracts,
                    content='Document',
                    content_rowid='id'
                );
            `);
            
            // 2. Create Synchronization Triggers
            await db.$executeRawUnsafe(`
                CREATE TRIGGER Document_ai AFTER INSERT ON Document BEGIN
                    INSERT INTO DocumentIndex(rowid, title, extracts) VALUES (new.id, new.title, new.extracts);
                END;
            `);
            
            await db.$executeRawUnsafe(`
                CREATE TRIGGER Document_ad AFTER DELETE ON Document BEGIN
                    INSERT INTO DocumentIndex(DocumentIndex, rowid, title, extracts) VALUES('delete', old.id, old.title, old.extracts);
                END;
            `);
            
            await db.$executeRawUnsafe(`
                CREATE TRIGGER Document_au AFTER UPDATE ON Document BEGIN
                    INSERT INTO DocumentIndex(DocumentIndex, rowid, title, extracts) VALUES('delete', old.id, old.title, old.extracts);
                    INSERT INTO DocumentIndex(rowid, title, extracts) VALUES (new.id, new.title, new.extracts);
                END;
            `);

            // 3. Populate existing data
            console.log("[FTS] Populating Document Search Index...");
            await db.$executeRawUnsafe(`INSERT INTO DocumentIndex(DocumentIndex) VALUES('rebuild');`);
            
            await logActivity(null, 'System Search', 'Successfully initialized and built the Full-Text Search index.', 'success');
        }

        initialized = true;
        console.log("[FTS] Full Text Search Engine Initialized");
    } catch (e) {
        console.error("[FTS] Failed to initialize search index", e);
        await logActivity(null, 'System Search', 'Failed to build search index.', 'error', String(e));
    }
}
