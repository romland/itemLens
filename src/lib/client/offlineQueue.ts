export async function initDB() {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('ItemLensOffline', 1);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('timelineQueue')) {
                db.createObjectStore('timelineQueue', { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveToQueue(formData: FormData) {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('timelineQueue', 'readwrite');
        const store = tx.objectStore('timelineQueue');
        
        // Convert FormData to a storable object
        const payload: any = { timestamp: Date.now() };
        formData.forEach((value, key) => { payload[key] = value; });
        
        store.add(payload);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getQueue() {
    const db = await initDB();
    return new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction('timelineQueue', 'readonly');
        const store = tx.objectStore('timelineQueue');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function clearQueueItem(id: number) {
    const db = await initDB();
    return new Promise<void>((resolve) => {
        const tx = db.transaction('timelineQueue', 'readwrite');
        tx.objectStore('timelineQueue').delete(id);
        tx.oncomplete = () => resolve();
    });
}