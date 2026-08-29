import { writable } from 'svelte/store';

export interface OutboxItem {
    id?: number;
    endpoint: string;
    payload: Record<string, any>;
    timestamp: number;
    status: 'pending' | 'syncing' | 'failed';
    retries: number;
}

// Reactive store so the UI can show upload progress/status globally
export const outboxStore = writable<OutboxItem[]>([]);
export const completedOutboxStore = writable<OutboxItem[]>([]);

const DB_NAME = 'ItemLensOutbox';
const STORE_NAME = 'outboxQueue';

export async function initDB() {
    return new Promise<IDBDatabase>((resolve, reject) => {
        // Bumped version and renamed to be a universal outbox, not just timeline
        const request = indexedDB.open(DB_NAME, 2);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Serializes FormData (including files and array keys) into a storable object.
 */
export async function serializeFormData(formData: FormData): Promise<Record<string, any>> {
    const obj: Record<string, any> = {};
    for (const [key, value] of formData.entries()) {
        let storedValue: any = value;
        
        // CRITICAL FIX: Lock files into memory via ArrayBuffer.
        // Mobile WebKit destroys File pointers immediately upon DOM teardown.
        if (value instanceof File && value.size > 0) {
            const buffer = await value.arrayBuffer();
            storedValue = {
                _isFile: true,
                name: value.name,
                type: value.type,
                buffer: buffer
            };
        } else if (value instanceof File && value.size === 0) {
            continue; // Skip the empty template file input entirely
        }

        if (obj.hasOwnProperty(key)) {
            if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
            obj[key].push(storedValue);
        } else {
            obj[key] = storedValue;
        }
    }
    return obj;
}

/**
 * Deserializes the object back into a fetch-ready FormData instance.
 */
export function deserializeToFormData(obj: Record<string, any>): FormData {
    const fd = new FormData();
    for (const key in obj) {
        const values = Array.isArray(obj[key]) ? obj[key] : [obj[key]];
        values.forEach(val => {
            if (val && val._isFile) {
                // Reconstitute the Blob from the frozen ArrayBuffer
                const blob = new Blob([val.buffer], { type: val.type });
                fd.append(key, blob, val.name);
            } else {
                fd.append(key, val);
            }
        });
    }
    return fd;
}

export async function saveToQueue(endpoint: string, formData: FormData) {
    const db = await initDB();
    const payload = await serializeFormData(formData);
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        const item: OutboxItem = {
            endpoint,
            payload,
            timestamp: Date.now(),
            status: 'pending',
            retries: 0
        };
        
        store.add(item);
        tx.oncomplete = () => { refreshStore(); resolve(); };
        tx.onerror = () => reject(tx.error);
    });
}

export async function getQueue() {
    const db = await initDB();
    return new Promise<OutboxItem[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function clearQueueItem(id: number) {
    const db = await initDB();
    return new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => { refreshStore(); resolve(); };
    });
}

export async function clearEntireQueue() {
    const db = await initDB();
    return new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => { refreshStore(); resolve(); };
    });
}

export async function updateQueueItemStatus(id: number, status: OutboxItem['status'], retries: number) {
    const db = await initDB();
    return new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
            const item = req.result as OutboxItem;
            if (item) {
                item.status = status;
                item.retries = retries;
                store.put(item);
            }
        };
        tx.oncomplete = () => { refreshStore(); resolve(); };
    });
}

export async function refreshStore() {
    const items = await getQueue();
    outboxStore.set(items);
}
