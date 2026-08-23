/// <reference types="node" />

// npx tsx scripts/simulate-uploads.ts

// Bypass self-signed certificate errors for local development
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// ==========================================
// CONFIGURATION
// ==========================================
const BASE_URL = "https://localhost:5173"; // Update if your dev server runs on a different port
const TARGET_INVENTORY_NAME = "Clothes24"; // Exact name of the inventory in the DB
const USER_ID = 2; // User ID to execute as
const DELAY_BETWEEN_UPLOADS_MS = 5000; // 20 seconds to respect LLM quotas (adjust as needed)

const CLOTHES_PATH = "/mnt/k/development/2024/inventory/USE_WSL_itemlens/static/images/tests/clothes";

// Provide the absolute or relative paths to the images on your disk
const singleImages: string[] = [
    CLOTHES_PATH+"/6695.jpg",
    CLOTHES_PATH+"/6703.jpg",
    CLOTHES_PATH+"/6857.jpg",
    CLOTHES_PATH+"/6863.jpg",
    CLOTHES_PATH+"/6878.jpg",
    CLOTHES_PATH+"/7054.jpg",
    CLOTHES_PATH+"/7191.jpg",
    CLOTHES_PATH+"/7199.jpg",
    CLOTHES_PATH+"/7200.jpg",
    CLOTHES_PATH+"/7201.jpg",
    CLOTHES_PATH+"/7202.jpg",
    CLOTHES_PATH+"/7316.jpg",
    CLOTHES_PATH+"/7348.jpg",
    CLOTHES_PATH+"/7409.jpg",
    CLOTHES_PATH+"/7410.jpg",
    CLOTHES_PATH+"/7424.jpg",
    CLOTHES_PATH+"/7571.jpg",
    CLOTHES_PATH+"/7572.jpg",
    CLOTHES_PATH+"/7577.jpg",
    CLOTHES_PATH+"/7798.jpg",
    CLOTHES_PATH+"/38981.jpg",
    CLOTHES_PATH+"/38982.jpg",
    CLOTHES_PATH+"/38994.jpg",
    CLOTHES_PATH+"/41629.jpg",
    CLOTHES_PATH+"/41667.jpg",
    CLOTHES_PATH+"/41672.jpg",
    CLOTHES_PATH+"/41811.jpg",
    CLOTHES_PATH+"/41814.jpg",
    CLOTHES_PATH+"/41852.jpg",
    CLOTHES_PATH+"/41890.jpg",
];

const collectionImages: string[] = [
    // "./test-images/bookshelf.jpg",
    // "./test-images/crate-of-games.jpg",
];
// ==========================================

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function getMimeType(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return 'image/jpeg';
}

async function getAuthHeaders() {
    const user = await prisma.user.findUnique({ where: { id: USER_ID } });
    if (!user || !user.token) throw new Error(`User ID ${USER_ID} not found or missing token.`);
    
    const inv = await prisma.inventory.findFirst({ where: { name: TARGET_INVENTORY_NAME } });
    if (!inv) throw new Error(`Inventory '${TARGET_INVENTORY_NAME}' not found.`);

    return {
        "Cookie": `session=${user.token}; activeInventoryId=${inv.id}`
    };
}

async function uploadSingleItem(filePath: string, headers: Record<string, string>) {
    console.log(`\n[Single] 📸 Starting upload for: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(filePath);
    const filename = path.basename(filePath);

    // ---------------------------------------------------------
    // STEP 1: Analyze Draft (Trigger Vision LLM)
    // ---------------------------------------------------------
    console.log(`[Single] 🧠 Analyzing draft...`);
    const fdDraft = new FormData();
    fdDraft.append('file', new Blob([fileBuffer], { type: mimeType }), filename);
    fdDraft.append('type', 'product');

    const draftRes = await fetch(`${BASE_URL}/api/analyze-draft`, {
        method: 'POST',
        headers,
        body: fdDraft
    });

    if (!draftRes.ok) throw new Error(`Draft analysis failed: ${draftRes.statusText}`);
    const draftData = await draftRes.json();
    console.log(`[Single] ✅ Draft analyzed! Detected as: "${draftData.aiData?.title || 'Unknown'}"`);

    // ---------------------------------------------------------
    // STEP 2: Save Item (Replicate SvelteKit Form Action)
    // ---------------------------------------------------------
    console.log(`[Single] 💾 Saving item to database...`);
    const fdSave = new FormData();
    fdSave.append('title', draftData.aiData?.title || 'Unknown Item');
    fdSave.append('description', draftData.aiData?.description || '');
    fdSave.append('amount', '1');
    fdSave.append('clientId', crypto.randomUUID());
    
    // Pass the file again (UI behavior)
    fdSave.append('file.0', new Blob([fileBuffer], { type: mimeType }), filename);
    fdSave.append('file.type.0', 'product');
    fdSave.append('file.draft.0', draftData.draftPath);

    const saveRes = await fetch(`${BASE_URL}/add`, {
        method: 'POST',
        headers: { ...headers, 'x-sveltekit-action': 'true', 'Accept': 'application/json' },
        body: fdSave
    });

    if (!saveRes.ok) throw new Error(`Form submission failed: ${saveRes.statusText}`);
    const saveData = await saveRes.json();
    
    if (saveData.type === 'redirect') {
        console.log(`[Single] 🎉 Successfully saved! Redirecting to: ${saveData.location}`);
    } else if (saveData.type === 'failure') {
        console.error(`[Single] ❌ Save failed:`, saveData.data);
    }
}

async function uploadCollection(filePath: string, headers: Record<string, string>) {
    console.log(`\n[Collection] 📸 Starting bulk upload for: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(filePath);
    const filename = path.basename(filePath);

    // ---------------------------------------------------------
    // STEP 1: Analyze Collection (Trigger Bounding Boxes)
    // ---------------------------------------------------------
    console.log(`[Collection] 🧠 Scanning collection...`);
    const fdColl = new FormData();
    fdColl.append('file', new Blob([fileBuffer], { type: mimeType }), filename);

    const collRes = await fetch(`${BASE_URL}/api/analyze-collection`, {
        method: 'POST',
        headers,
        body: fdColl
    });

    if (!collRes.ok) throw new Error(`Collection analysis failed: ${collRes.statusText}`);
    const collData = await collRes.json();
    console.log(`[Collection] ✅ Scan complete! Found ${collData.items?.length || 0} items.`);

    if (!collData.items || collData.items.length === 0) {
        console.log(`[Collection] ⚠️ Skipping save, no items detected.`);
        return;
    }

    // ---------------------------------------------------------
    // STEP 2: Bulk Save (Simulate user clicking "Save All")
    // ---------------------------------------------------------
    console.log(`[Collection] 💾 Dispatching bulk save to background worker...`);
    
    // Map items exactly how the frontend Svelte component maps them
    const itemsToSave = collData.items.map((item: any) => ({
        title: item.title,
        subtitle: item.subtitle,
        category: item.category,
        box: item.box,
        extractedAttributes: item.extractedAttributes,
        physical_traits: item.physical_traits,
        prominent_text_or_graphic: item.prominent_text_or_graphic,
        distinctive_blemishes_or_wear: item.distinctive_blemishes_or_wear,
        color_mix: item.color_mix,
        resolution: 'new', // Force insert as new (ignore deduplication for script simulation)
        duplicateItemDetails: null
    }));

    const saveRes = await fetch(`${BASE_URL}/api/bulk-save`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            draftPath: collData.draftPath,
            noteId: collData.noteId,
            containers: [], // Assigning to "Unassigned"
            globalCategory: "",
            tagcsv: "",
            items: itemsToSave
        })
    });

    if (!saveRes.ok) throw new Error(`Bulk save failed: ${saveRes.statusText}`);
    console.log(`[Collection] 🎉 Bulk save queued successfully!`);
}

async function run() {
    try {
        console.log("=== ITEMLENS UPLOAD SIMULATOR ===");
        const headers = await getAuthHeaders();
        console.log("🔓 Authentication successful.");

        for (const file of singleImages) {
            if (fs.existsSync(file)) {
                await uploadSingleItem(file, headers);
                console.log(`⏳ Sleeping for ${DELAY_BETWEEN_UPLOADS_MS / 1000} seconds to cool down LLM...`);
                await sleep(DELAY_BETWEEN_UPLOADS_MS);
            } else {
                console.warn(`⚠️ File not found: ${file}`);
            }
        }

        for (const file of collectionImages) {
            if (fs.existsSync(file)) {
                await uploadCollection(file, headers);
                console.log(`⏳ Sleeping for ${DELAY_BETWEEN_UPLOADS_MS / 1000} seconds to cool down LLM...`);
                await sleep(DELAY_BETWEEN_UPLOADS_MS);
            } else {
                console.warn(`⚠️ File not found: ${file}`);
            }
        }

        console.log("\n✅ All simulated uploads finished!");
    } catch (e) {
        console.error("\n❌ Fatal Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();