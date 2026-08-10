import { db } from '$lib/server/database';

export async function logActivity(itemId: number | null | undefined, action: string, message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') {
    if (!itemId) return;
    try {
        await db.activityLog.create({
            data: { itemId, action, message, level }
        });
    } catch (e) {
        console.error("Failed to write ActivityLog:", e);
    }
}