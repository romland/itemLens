<script lang="ts">
    import type { PageServerData } from './$types';
    import { flip } from 'svelte/animate';
    import { fade, slide } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import pageTitle from '$lib/stores';
    import ImageLightbox from "$lib/components/ImageLightbox.svelte";

    export let data: PageServerData;

    pageTitle.set("Mission Control");

    let activeTab: 'queues' | 'llms' = 'queues';
    let lightbox: ImageLightbox;

    function getDuration(start: number, end?: number) {
        const duration = (end || Date.now()) - start;
        return (duration / 1000).toFixed(1) + 's';
    }
</script>

<div class="max-w-4xl mx-auto flex flex-col gap-6 animate-fade-in pb-12">
    <!-- Header Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        
        <button type="button" on:click={() => activeTab = 'llms'} class="bg-base-100 border border-base-200 shadow-sm rounded-3xl p-6 flex flex-col justify-between group hover:border-info transition-colors cursor-pointer relative overflow-hidden h-36 w-full text-left">
            <div class="absolute -right-4 -top-4 w-24 h-24 bg-info/10 rounded-full blur-2xl"></div>
            <div class="text-sm font-semibold uppercase tracking-wider text-gray-500 relative z-10 w-full">LLM Network</div>
            <div class="text-3xl font-bold tracking-tight text-base-content flex items-center gap-2 relative z-10">
                {data.llmLogs.length} <span class="text-sm font-medium text-gray-500">requests</span>
            </div>
        </button>

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

    <!-- TABS -->
    <div class="flex gap-2 bg-base-200/50 p-1 rounded-2xl w-full sm:w-fit mx-auto sm:mx-0">
        <button class="flex-1 sm:flex-none px-6 py-2 rounded-xl transition-all {activeTab === 'queues' ? 'bg-base-100 shadow-sm text-base-content font-bold' : 'text-gray-500 hover:text-base-content'}" on:click={() => activeTab = 'queues'}>Task Queues</button>
        <button class="flex-1 sm:flex-none px-6 py-2 rounded-xl transition-all {activeTab === 'llms' ? 'bg-base-100 shadow-sm text-base-content font-bold' : 'text-gray-500 hover:text-base-content'}" on:click={() => activeTab = 'llms'}>LLM Logs</button>
    </div>

    {#if activeTab === 'queues'}
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
    {:else}
        <!-- LLM Network Logs -->
        <div>
            <!-- Token Usage Dashboard -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {#each ['gemini', 'groq', 'openai', 'replicate'] as srv}
                    {@const stat = data.usageStats[srv] || { requests: 0, tokensIn: 0, tokensOut: 0 }}
                    <div class="bg-base-100 border border-base-200 rounded-2xl p-4 shadow-sm flex flex-col">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 flex justify-between">
                            {srv}
                            <span class="text-info">{data.rpm[srv]} / min</span>
                        </div>
                        <div class="text-xl font-bold tracking-tight mb-1">{stat.requests} <span class="text-xs font-normal text-gray-500">reqs</span></div>
                        <div class="flex flex-col gap-0.5 text-[10px] font-mono text-gray-500 mt-auto">
                            <div class="flex justify-between"><span>In:</span> <span>{stat.tokensIn.toLocaleString()}</span></div>
                            <div class="flex justify-between"><span>Out:</span> <span class="text-success">{stat.tokensOut.toLocaleString()}</span></div>
                        </div>
                    </div>
                {/each}
            </div>

            <div class="flex items-center justify-between mb-3">
                <h2 class="text-lg font-bold flex items-center gap-2">
                    <i class="bi bi-list-columns-reverse text-info"></i> Recent Prompts
                </h2>
            </div>
            {#if data.llmLogs.length === 0}
                <div class="bg-base-200/30 border border-base-200 border-dashed rounded-3xl p-8 text-center text-gray-400 flex flex-col items-center justify-center">
                    <i class="bi bi-chat-square-dots text-4xl mb-2 opacity-50"></i>
                    <p class="font-medium">No LLM Activity</p>
                    <p class="text-xs">No AI requests have been made since the server started.</p>
                </div>
            {:else}
                <div class="flex flex-col gap-4">
                    {#each data.llmLogs as log}
                        <div class="bg-base-100 border border-base-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
                            <div class="bg-base-200/50 px-6 py-3 border-b border-base-200 flex justify-between items-center">
                                <div class="flex items-center gap-3">
                                    <span class="font-bold text-info tracking-tight">{log.taskName}</span>
                                    <span class="badge badge-sm font-bold uppercase">{log.service}</span>
                                    {#if log.itemId}
                                        <span class="badge badge-ghost badge-sm border-base-300 shadow-sm"><i class="bi bi-box mr-1"></i> Item #{log.itemId}</span>
                                    {/if}
                                    {#if log.path}
                                        <button class="badge badge-ghost badge-sm border-base-300 shadow-sm max-w-[150px] truncate hover:border-primary cursor-zoom-in transition-colors" title="View {log.path}" on:click={() => lightbox.open({ orgPath: log.path.replace(/^static/, ''), showOriginal: true })}><i class="bi bi-file-image mr-1"></i> {log.path.split('/').pop()}</button>
                                    {/if}
                                    <span class="text-xs text-gray-500">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                </div>
                                <span class="badge badge-ghost badge-sm font-mono border-base-300">{log.durationMs}ms</span>
                                <span class="badge badge-ghost badge-sm font-mono border-base-300">{log.durationMs}ms | {log.tokensIn} in / {log.tokensOut} out</span>
                            </div>
                            <div class="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                                <div class="flex flex-col min-w-0">
                                    <h3 class="font-bold text-xs uppercase text-gray-500 mb-2 tracking-wider flex items-center gap-2"><i class="bi bi-box-arrow-in-right"></i> Prompt Sent</h3>
                                    <pre class="bg-base-200/50 border border-base-200 p-4 rounded-2xl text-[10px] sm:text-xs overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto w-full font-mono">{typeof log.input === 'string' ? log.input : JSON.stringify(log.input, null, 2)}</pre>
                                </div>
                                <div class="flex flex-col min-w-0">
                                    <h3 class="font-bold text-xs uppercase text-gray-500 mb-2 tracking-wider flex items-center gap-2"><i class="bi bi-box-arrow-right text-success"></i> Response Received</h3>
                                    <pre class="bg-success/5 text-success-content border border-success/20 p-4 rounded-2xl text-[10px] sm:text-xs overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto w-full font-mono">{typeof log.output === 'string' ? log.output : JSON.stringify(log.output, null, 2)}</pre>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>

<ImageLightbox bind:this={lightbox} itemTitle="LLM Source Image" />