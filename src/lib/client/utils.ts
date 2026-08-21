export function copyDuplicateDebugPayload(title: string, scannedItem: any, dbItem: any) {
    console.group(`🐞 DEBUG: ${title}`);
    console.log("--- SCANNED ITEM (NEW) ---", scannedItem);
    console.log("--- DATABASE ITEM (EXISTING) ---", dbItem);
    if (dbItem?.debugTrace) {
        console.log("--- MATCH ALGORITHM TRACE ---");
        dbItem.debugTrace.forEach((l: string) => console.log(l));
    }
    console.groupEnd();

    const cleanObj = (obj: any) => {
        if (!obj) return null;
        const { contentToHtml, thumbPath, orgPath, cropPath, logs, documents, photos, ...rest } = obj;
        if (photos) rest.photos = photos.map((p: any) => ({ id: p.id, type: p.type }));
        return rest;
    };
    const payload = { scannedItem: cleanObj(scannedItem), dbItem: cleanObj(dbItem) };
    
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
        alert("Debug data dumped to console AND copied to clipboard!");
    }).catch(() => alert("Debug data dumped to console! (Clipboard copy failed)"));
}