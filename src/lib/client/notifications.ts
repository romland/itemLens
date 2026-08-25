// src/lib/client/notifications.ts
import { writable } from 'svelte/store';

export interface AppNotification {
    id: string;
    status: string;
    message: string;
}

export const notifications = writable<AppNotification[]>([]);

export function notify(status: string, message: string, id: string | null = null): string {
    const newId = id || Math.random().toString(36).substring(2);
    
    notifications.update(n => {
        const existingIndex = n.findIndex(x => x.id === newId);
        if (existingIndex !== -1) {
            const updated = [...n];
            updated[existingIndex] = { id: newId, status, message };
            return updated;
        }
        return [...n, { id: newId, status, message }];
    });

    if (status !== 'loading') {
        setTimeout(() => removeNotification(newId), 3000);
    }
    
    return newId;
}

export function removeNotification(id: string) {
    notifications.update(n => n.filter(x => x.id !== id));
}