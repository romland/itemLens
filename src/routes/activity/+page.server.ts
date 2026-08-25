import type { PageServerLoad } from './$types';
import { taskManager } from '$lib/server/taskManager';
import { getLLMLogs, llmUsageStats } from '$lib/server/llmLogger';
import { db } from '$lib/server/database';

export const load = (async ({ url }) => {
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
    
    // Parse timeframe (Default: 24h)
    const timeframe = url.searchParams.get('t') || '24h';
    let since = new Date(0); // 'all' time
    const now = Date.now();

    switch (timeframe) {
        case '1h': since = new Date(now - 1 * 60 * 60 * 1000); break;
        case '6h': since = new Date(now - 6 * 60 * 60 * 1000); break;
        case '12h': since = new Date(now - 12 * 60 * 60 * 1000); break;
        case '24h': since = new Date(now - 24 * 60 * 60 * 1000); break;
        case '7d': since = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
        case '30d': since = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
        case '1y': since = new Date(now - 365 * 24 * 60 * 60 * 1000); break;
    }

    // Aggregate Model Usage
    const metrics = await db.systemMetric.groupBy({
        by: ['provider'],
        where: { category: 'MODEL_USAGE', createdAt: { gte: since } },
        _sum: {
            count1: true, // Tokens In
            count2: true, // Tokens Out
            durationMs: true
        },
        _count: { id: true }, // Total API Requests
        orderBy: { provider: 'asc' }
    });

    return {
        activeTasks,
        completedTasks,
        llmLogs,
        usageStats: llmUsageStats,
        rpm,
        metrics,
        timeframe
    };
}) satisfies PageServerLoad;