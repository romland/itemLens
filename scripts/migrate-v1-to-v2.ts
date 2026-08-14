/// <reference types="node" />
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const oldDbPath = path.resolve('./prisma/dev.db');
const newDbPath = path.resolve('./prisma/v2.db');

if (!fs.existsSync(oldDbPath) || !fs.existsSync(newDbPath)) {
    console.error("Missing database files. Ensure dev.db (old) and v2.db (new) exist.");
    process.exit(1);
}

const oldDb = new Database(oldDbPath, { readonly: true });
const newDb = new Database(newDbPath);

// CRITICAL FIX: Turn off foreign key constraints during the migration
// This allows us to insert child containers before their parents without SQLite throwing an error.
newDb.pragma('foreign_keys = OFF');

const migrate = newDb.transaction(() => {
    console.log("Starting Migration...");

    // Pre-fetch inventories to find a safe default fallback ID
    const inventories = oldDb.prepare('SELECT * FROM Inventory').all() as any[];
    const defaultInvId = inventories.length > 0 ? inventories[0].id : 1;

    // 1. Migrate Users
    console.log("Migrating Users...");
    const users = oldDb.prepare('SELECT * FROM User').all();
    const insertUser = newDb.prepare('INSERT INTO User (id, username, password, token, email, name, avatar, isAdmin, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const u of users as any[]) {
        const isAdmin = u.id === 1 ? 1 : 0;
        insertUser.run(u.id, u.username, u.password, u.token, u.email, u.name, u.avatar, isAdmin, u.createdAt, u.updatedAt);
    }

    // 2. Migrate Inventories
    console.log("Migrating Inventories...");
    const insertInv = newDb.prepare('INSERT INTO Inventory (id, name, description, classes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)');
    for (const i of inventories) {
        insertInv.run(i.id, i.name, i.description, i.classes, i.createdAt, i.updatedAt);
    }

    if (inventories.length === 0) {
        insertInv.run(defaultInvId, "Default Inventory", "Auto-generated", "[]", new Date().toISOString(), new Date().toISOString());
    }

    // 3. Setup Access (Grant all users OWNER to the default inventory)
    console.log("Setting up User Access...");
    const insertAccess = newDb.prepare('INSERT INTO UserInventoryAccess (inventoryId, userId, role) VALUES (?, ?, ?)');
    for (const u of users as any[]) {
        insertAccess.run(defaultInvId, u.id, "OWNER");
    }

    // 4. Migrate Categories
    console.log("Migrating Categories...");
    const categories = oldDb.prepare('SELECT * FROM Category').all();
    const insertCat = newDb.prepare('INSERT INTO Category (id, name, slug, description, inventoryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const c of categories as any[]) {
        const invId = c.inventoryId || defaultInvId;
        insertCat.run(c.id, c.name, c.slug, c.description, invId, c.createdAt, c.updatedAt);
    }

    // 5. Migrate Containers (THE BIG CHANGE: String ID to Int ID)
    console.log("Migrating Containers...");
    const containers = oldDb.prepare('SELECT * FROM Container').all();
    const insertContainer = newDb.prepare('INSERT INTO Container (id, name, description, location, photoPath, inventoryId, parentId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
    const containerIdMap = new Map<string, number>();
    let containerCounter = 1;

    // Create mappings first
    for (const c of containers as any[]) {
        containerIdMap.set(c.name, containerCounter++);
    }

    // Then insert based on new integer IDs
    for (const c of containers as any[]) {
        const newId = containerIdMap.get(c.name);
        const newParentId = c.parentId ? containerIdMap.get(c.parentId) : null;
        insertContainer.run(newId, c.name, c.description, c.location, c.photoPath, defaultInvId, newParentId, c.createdAt, c.updatedAt);
    }

    // 6. Migrate Tags
    console.log("Migrating Tags...");
    const tags = oldDb.prepare('SELECT * FROM Tag').all();
    const insertTag = newDb.prepare('INSERT INTO Tag (id, name, slug, inventoryId) VALUES (?, ?, ?, ?)');
    for (const t of tags as any[]) {
        insertTag.run(t.id, t.name, t.slug, defaultInvId);
    }

    // 7. Migrate Items
    console.log("Migrating Items...");
    const items = oldDb.prepare('SELECT * FROM Item').all();
    const insertItem = newDb.prepare('INSERT INTO Item (id, slug, amount, title, description, reason, inventoryId, authorId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const i of items as any[]) {
        const invId = i.inventoryId || defaultInvId;
        insertItem.run(i.id, i.slug, i.amount, i.title, i.description, i.reason, invId, i.authorId, i.createdAt, i.updatedAt);
    }

    // 8. Migrate ItemsInContainer
    console.log("Migrating ItemsInContainer mappings...");
    const iic = oldDb.prepare('SELECT * FROM ItemsInContainer').all();
    const insertIic = newDb.prepare('INSERT INTO ItemsInContainer (itemId, containerId) VALUES (?, ?)');
    for (const mapping of iic as any[]) {
        const newContainerId = containerIdMap.get(mapping.containerName);
        if (newContainerId) {
            insertIic.run(mapping.itemId, newContainerId);
        }
    }

    // 9. Migrate TimelineNotes
    console.log("Migrating TimelineNotes...");
    const notes = oldDb.prepare('SELECT * FROM TimelineNote').all();
    const insertNote = newDb.prepare('INSERT INTO TimelineNote (id, content, latitude, longitude, category, inventoryId, authorId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const n of notes as any[]) {
        insertNote.run(n.id, n.content, n.latitude, n.longitude, n.category, defaultInvId, n.authorId, n.createdAt, n.updatedAt);
    }

    // 10. Migrate Sub-entities
    console.log("Migrating sub-entities (Photos, Docs, KVPs, etc)...");
    
    const photos = oldDb.prepare('SELECT * FROM Photo').all();
    const insertPhoto = newDb.prepare('INSERT INTO Photo (id, type, orgPath, cropPath, thumbPath, ocr, showOriginal, colors, classBlip, classTrash, llmAnalysis, categoryId, itemId, timelineNoteId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of photos as any[]) {
        insertPhoto.run(p.id, p.type, p.orgPath, p.cropPath, p.thumbPath, p.ocr, p.showOriginal, p.colors, p.classBlip, p.classTrash, p.llmAnalysis, p.categoryId, p.itemId, p.timelineNoteId, p.createdAt, p.updatedAt);
    }

    const docs = oldDb.prepare('SELECT * FROM Document').all();
    const insertDoc = newDb.prepare('INSERT INTO Document (id, type, title, source, path, extracts, summary, itemId, timelineNoteId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const d of docs as any[]) {
        insertDoc.run(d.id, d.type, d.title, d.source, d.path, d.extracts, d.summary, d.itemId, d.timelineNoteId, d.createdAt, d.updatedAt);
    }

    const kvps = oldDb.prepare('SELECT * FROM KVP').all();
    const insertKvp = newDb.prepare('INSERT INTO KVP (id, key, value, itemId) VALUES (?, ?, ?, ?)');
    for (const k of kvps as any[]) {
        insertKvp.run(k.id, k.key, k.value, k.itemId);
    }

    const inUse = oldDb.prepare('SELECT * FROM InUse').all();
    // Catch cases where the old db might not have this table if it was fully empty/unmigrated
    if (inUse.length > 0) {
        const insertInUse = newDb.prepare('INSERT INTO InUse (id, title, description, itemId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)');
        for (const u of inUse as any[]) {
            insertInUse.run(u.id, u.title, u.description, u.itemId, u.createdAt, u.updatedAt);
        }
    }

    const logs = oldDb.prepare('SELECT * FROM ActivityLog').all();
    const insertLog = newDb.prepare('INSERT INTO ActivityLog (id, level, action, message, itemId, createdAt) VALUES (?, ?, ?, ?, ?, ?)');
    for (const l of logs as any[]) {
        insertLog.run(l.id, l.level, l.action, l.message, l.itemId, l.createdAt);
    }

    // Implicit joins
    console.log("Migrating Prisma implicit join tables...");
    const tagItems = oldDb.prepare('SELECT * FROM _ItemToTag').all();
    const insertTagItem = newDb.prepare('INSERT INTO _ItemToTag (A, B) VALUES (?, ?)');
    for (const ti of tagItems as any[]) {
        insertTagItem.run(ti.A, ti.B);
    }

    const noteItems = oldDb.prepare('SELECT * FROM _TimelineNoteToItem').all();
    const insertNoteItem = newDb.prepare('INSERT INTO _TimelineNoteToItem (A, B) VALUES (?, ?)');
    for (const ni of noteItems as any[]) {
        insertNoteItem.run(ni.A, ni.B);
    }

    console.log("✅ Migration complete!");
});

migrate();

// Turn constraints back on to ensure the new DB is fully verified
newDb.pragma('foreign_keys = ON');

oldDb.close();
newDb.close();