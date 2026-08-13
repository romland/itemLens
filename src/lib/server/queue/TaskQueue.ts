import { taskManager, type TaskTrackingMeta } from '../taskManager';

/**
 * A generic, promise-based concurrency queue.
 * Prevents server overload by limiting simultaneous task execution.
 */
export class TaskQueue {
    private concurrency: number;
    private running: number = 0;
    private queue: { task: () => Promise<any>, resolve: (val: any) => void, reject: (err: any) => void, taskId?: string }[] = [];

    constructor(concurrency: number) {
        this.concurrency = concurrency;
    }

    /**
     * Adds a task to the queue. Returns a Promise that resolves when the task naturally completes.
     */
      public add<T>(task: () => Promise<T>, tracking?: TaskTrackingMeta): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let taskId: string | undefined;
            if (tracking) {
                taskId = taskManager.start(tracking.targetType, tracking.targetId, tracking.description);
            }
            this.queue.push({ task, resolve, reject, taskId });
            this.processNext();
        });
    }

    private async processNext() {
        // Stop if we hit our concurrency cap, or if there's nothing to do
        if (this.running >= this.concurrency || this.queue.length === 0) return;
        
        this.running++;
        const job = this.queue.shift();
        
        if (job) {
            try {
                const result = await job.task();
                job.resolve(result);
            } catch (error) {
                job.reject(error);
            } finally {
                if (job.taskId) taskManager.end(job.taskId);
                this.running--;
                this.processNext();
            }
        }
    }
}