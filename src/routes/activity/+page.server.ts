import type { PageServerLoad } from './$types';
import { taskManager } from '$lib/server/taskManager';
import { getLLMLogs, llmUsageStats } from '$lib/server/llmLogger';

export const load = (async () => {
    // We clone the arrays to prevent any reactive mutation issues during serialization
    const activeTasks = [...taskManager.getAllTasks()];
    const completedTasks = [...taskManager.getCompletedTasks()];
    const llmLogs = [...getLLMLogs()];
    
    // Compute rolling last minute requests by counting recent logs
    const oneMinuteAgo = Date.now() - 60000;
    const rpm = { gemini: 0, groq: 0, openai: 0, replicate: 0 };
    for (const log of llmLogs) {
        if (log.timestamp > oneMinuteAgo && rpm[log.service as keyof typeof rpm] !== undefined) {
            rpm[log.service as keyof typeof rpm]++;
        }
    }
    
    return {
        activeTasks,
        completedTasks,
        llmLogs,
        usageStats: llmUsageStats,
        rpm
    };
}) satisfies PageServerLoad;