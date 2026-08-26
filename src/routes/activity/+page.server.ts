import type { PageServerLoad } from './$types';
import { taskManager } from '$lib/server/taskManager';
import { getLLMLogs, llmUsageStats } from '$lib/server/llmLogger';
import { db } from '$lib/server/database';

export const load = (async ({ url }) => {
    // We clone the arrays to prevent any reactive mutation issues during serialization
    const activeTasks = [...taskManager.getAllTasks()];
    const completedTasks = [...taskManager.getCompletedTasks()];
    const llmLogs = [...getLLMLogs()];
    
    // Compute rolling last 1, 5, 10, 15, and 30-minute requests by counting recent logs
    const oneMinuteAgo = Date.now() - 60000;
    const fiveMinutesAgo = Date.now() - 300000;
    const tenMinutesAgo = Date.now() - 600000;
    const fifteenMinutesAgo = Date.now() - 900000;
    const thirtyMinutesAgo = Date.now() - 1800000;
    const rpm1m: Record<string, number> = { gemini: 0, groq: 0, openai: 0, replicate: 0 };
    const rpm5m: Record<string, number> = { gemini: 0, groq: 0, openai: 0, replicate: 0 };
    const rpm10m: Record<string, number> = { gemini: 0, groq: 0, openai: 0, replicate: 0 };
    const rpm15m: Record<string, number> = { gemini: 0, groq: 0, openai: 0, replicate: 0 };
    const rpm30m: Record<string, number> = { gemini: 0, groq: 0, openai: 0, replicate: 0 };
    for (const log of llmLogs) {
        if (log.timestamp > oneMinuteAgo && rpm1m[log.service] !== undefined) {
            rpm1m[log.service]++;
        }
        if (log.timestamp > fiveMinutesAgo && rpm5m[log.service] !== undefined) {
            rpm5m[log.service]++;
        }
        if (log.timestamp > tenMinutesAgo && rpm10m[log.service] !== undefined) {
            rpm10m[log.service]++;
        }
        if (log.timestamp > fifteenMinutesAgo && rpm15m[log.service] !== undefined) {
            rpm15m[log.service]++;
        }
        if (log.timestamp > thirtyMinutesAgo && rpm30m[log.service] !== undefined) {
            rpm30m[log.service]++;
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
        rpm1m,
        rpm5m,
        rpm10m,
        rpm15m,
        rpm30m,
        metrics,
        timeframe
    };
}) satisfies PageServerLoad;