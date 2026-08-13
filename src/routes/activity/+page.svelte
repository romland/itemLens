<script lang="ts">
    import type { PageServerData } from './$types';
    import { flip } from 'svelte/animate';
    import { fade, slide } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import pageTitle from '$lib/stores';

    export let data: PageServerData;

    pageTitle.set("Mission Control");

    function getDuration(start: number, end?: number) {
        const duration = (end || Date.now()) - start;
        return (duration / 1000).toFixed(1) + 's';
    }
</script>

<div class="max-w-4xl mx-auto flex flex-col gap-6 animate-fade-in pb-12">
    <!-- Header Stats -->
    <div class="grid grid-cols-2 gap-4">
        <div class="bg-base-100 border border-base-200 shadow-sm rounded-3xl p-6 flex flex-col justify-between items-start relative overflow-hidden h-36">
            <div class="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl"></div>
            <div class="text-sm font-semibold uppercase tracking-wider text-gray-500 relative z-10 w-full">Active Tasks</div>
            <div class="text-5xl font-bold tracking-tight text-base-content flex items-center gap-3">
                {data.activeTasks.length}
                {#if data.activeTasks.length > 0}
                    <span class="relative flex h-4 w-4">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-4 w-4 bg-primary"></span>
                    </span>
                {/if}
            </div>
        </div>
        <a href="/activity/logs" class="bg-base-100 border border-base-200 shadow-sm rounded-3xl p-6 flex flex-col justify-between group hover:border-primary transition-colors cursor-pointer relative overflow-hidden h-36 w-full">
            <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-secondary/10 rounded-full blur-2xl"></div>
            <div class="flex justify-between items-center w-full relative z-10">
                <div class="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-1">System Log</div>
                <i class="bi bi-arrow-right-short text-2xl text-gray-400 group-hover:text-primary transition-transform group-hover:translate-x-1"></i>
            </div>
            <div class="text-xl font-bold tracking-tight text-base-content flex items-center gap-2 relative z-10">
                <i class="bi bi-database"></i> View History
            </div>
        </a>
    </div>

    <!-- Active Tasks List -->
    <div>
        <h2 class="text-lg font-bold mb-3 flex items-center gap-2">
            <i class="bi bi-cpu text-primary"></i> Processing Now
        </h2>
        <div class="flex flex-col gap-2">
            {#each data.activeTasks as task (task.id)}
                <div 
                    animate:flip={{ duration: 300, easing: cubicOut }}
                    transition:slide={{ duration: 200 }}
                    class="bg-base-100/80 backdrop-blur-xl border border-base-200 shadow-sm rounded-2xl p-4 flex items-center justify-between gap-4"
                >
                    <div class="flex items-center gap-4 min-w-0">
                        <span class="loading loading-ring text-primary loading-md shrink-0"></span>
                        <div class="min-w-0 flex flex-col">
                            <span class="font-bold text-base-content truncate">{task.description}</span>
                            <span class="text-xs text-gray-500 uppercase tracking-wider font-semibold flex items-center gap-1 mt-0.5">
                                {#if task.targetType === 'item'} <i class="bi bi-box"></i> Item #{task.targetId}
                                {:else if task.targetType === 'note'} <i class="bi bi-journal-text"></i> Note #{task.targetId}
                                {:else} <i class="bi bi-globe"></i> Global {/if}
                            </span>
                        </div>
                    </div>
                    <div class="text-xs font-mono text-gray-400 shrink-0 bg-base-200 px-2 py-1 rounded-lg">
                        {getDuration(task.startTime)}
                    </div>
                </div>
            {:else}
                <div class="bg-base-200/30 border border-base-200 border-dashed rounded-3xl p-8 text-center text-gray-400 flex flex-col items-center justify-center">
                    <i class="bi bi-check-circle text-4xl mb-2 opacity-50"></i>
                    <p class="font-medium">System Idle</p>
                    <p class="text-xs">No background tasks running.</p>
                </div>
            {/each}
        </div>
    </div>

    <!-- Recently Completed -->
    {#if data.completedTasks.length > 0}
        <div class="mt-4">
            <h2 class="text-lg font-bold mb-3 flex items-center gap-2 text-gray-500">
                <i class="bi bi-check-all"></i> Recently Finished
            </h2>
            <div class="flex flex-col gap-2">
                {#each data.completedTasks as task (task.id)}
                    <div 
                        animate:flip={{ duration: 300, easing: cubicOut }}
                        transition:slide={{ duration: 200 }}
                        class="bg-base-200/30 border border-base-200 rounded-2xl p-4 flex items-center justify-between gap-4 opacity-70 hover:opacity-100 transition-opacity"
                    >
                        <div class="flex items-center gap-4 min-w-0">
                            <div class="w-6 h-6 rounded-full bg-success/20 text-success flex items-center justify-center shrink-0">
                                <i class="bi bi-check text-sm"></i>
                            </div>
                            <div class="min-w-0 flex flex-col">
                                <span class="font-medium text-base-content truncate">{task.description}</span>
                                <span class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-0.5">
                                    {task.targetType} #{task.targetId}
                                </span>
                            </div>
                        </div>
                        <div class="text-[10px] font-mono text-gray-400 shrink-0">
                            {getDuration(task.startTime, task.endTime)}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>