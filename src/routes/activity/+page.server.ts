import type { PageServerLoad } from './$types';
import { taskManager } from '$lib/server/taskManager';

export const load = (async () => {
    // We clone the arrays to prevent any reactive mutation issues during serialization
    const activeTasks = [...taskManager.getAllTasks()];
    const completedTasks = [...taskManager.getCompletedTasks()];
    
    return {
        activeTasks,
        completedTasks
    };
}) satisfies PageServerLoad;