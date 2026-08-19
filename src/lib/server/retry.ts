import { logActivity } from './logger';

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 1500, taskName = 'LLM Operation'): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            attempt++;
            return await fn();
        } catch (error: any) {
            if (attempt >= maxRetries) {
                console.error(`[Task Failure] ${taskName} failed after ${maxRetries} attempts:`, error);
                throw error;
            }
            console.warn(`[Task Retry] ${taskName} failed (Attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms...`, error.message);
            await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
    }
}