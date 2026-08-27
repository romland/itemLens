import { db } from '$lib/server/database';

export async function logActivity(itemId: number | null | undefined, action: string, message: string, level: string = 'info', payload: string | null = null) {
    try {
        await db.activityLog.create({
            data: { itemId: itemId || null, action, message, level, payload }
        });
    } catch (e) {
        console.error(`[Logger] Failed to log activity (Action: ${action}, ItemID: ${itemId}):`, e);
    }
}
