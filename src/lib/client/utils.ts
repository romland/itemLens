// This is very naive. Just one word: Buses.
export function pluralize(str: string): string {
    if (!str) return '';
    const lower = str.toLowerCase();
    if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('z') || lower.endsWith('ch') || lower.endsWith('sh')) return str;
    return str + 's';
}

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

export async function nukeAllCaches() {
	if (!confirm("This will clear all offline data, caches, and force a hard reload. Continue?")) return;
	if (typeof window !== 'undefined') {
		try { sessionStorage.clear(); localStorage.clear(); } catch(e) { console.warn("Storage clear blocked:", e); }
		try {
			if ('caches' in window) {
				const keys = await caches.keys();
				await Promise.all(keys.map(key => caches.delete(key)));
			}
		} catch(e) { console.warn("Cache clear blocked:", e); }
		try {
			if ('serviceWorker' in navigator) {
				const regs = await navigator.serviceWorker.getRegistrations();
				for (const r of regs) await r.unregister();
			}
		} catch(e) { console.warn("SW clear blocked:", e); }
		window.location.reload();
	}
}
