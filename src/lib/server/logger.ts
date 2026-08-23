import { db } from '$lib/server/database';

export async function logActivity(itemId: number, action: string, message: string, level: string = 'info', payload: string | null = null) {
    try {
        await db.activityLog.create({
            data: { itemId, action, message, level, payload }
        });
    } catch (e) {
        console.error("Failed to log activity", e);
    }
}
