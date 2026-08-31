<script lang="ts">
    import type { PageServerData } from './$types';
    import pageTitle from '$lib/stores';

    export let data: PageServerData;

    pageTitle.set("System Logs");
</script>

<div class="max-w-4xl mx-auto pb-12 animate-fade-in">
    <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold tracking-tight">Database Activity History</h1>
        <a href="/activity" class="btn btn-sm btn-ghost"><i class="bi bi-arrow-left"></i> Back to Live</a>
    </div>

    <div class="bg-base-100 border border-base-200 shadow-sm rounded-3xl overflow-hidden">
        <div class="overflow-x-auto">
            <table class="table table-zebra table-sm w-full">
                <thead>
                    <tr class="bg-base-200/50 text-gray-500">
						<th class="w-32 py-4 hidden sm:table-cell">Timestamp</th>
						<th class="w-24">Status</th>
                        <th>Action</th>
                        <th>Details</th>
						<th class="text-right hidden sm:table-cell">Target</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.logs as log}
                        <tr class="hover">
							<td class="text-xs font-mono text-gray-500 whitespace-nowrap hidden sm:table-cell">
                                {new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                            </td>
                            <td>
								<span class="badge badge-sm border-none font-bold uppercase tracking-wider text-[10px] sm:w-full
                                    {log.level === 'success' ? 'bg-success/20 text-success' : 
                                     log.level === 'warning' ? 'bg-warning/20 text-warning' : 
                                     log.level === 'error' ? 'bg-error/20 text-error' : 
                                     'bg-info/20 text-info'}">
									<span class="hidden sm:inline">{log.level}</span>
									<span class="sm:hidden">
										<i class="bi {log.level === 'success' ? 'bi-check-lg' : log.level === 'warning' ? 'bi-exclamation-triangle' : log.level === 'error' ? 'bi-x-lg' : 'bi-info-circle'}"></i>
									</span>
                                </span>
                            </td>
                            <td class="font-semibold text-xs whitespace-nowrap">{log.action}</td>
							<td class="text-xs max-w-[150px] sm:max-w-xs truncate" title={log.message}>{log.message}</td>
							<td class="text-right hidden sm:table-cell">
                                {#if log.item}
                                    <a href="/{log.item.id}/{log.item.slug}" class="text-xs text-primary hover:underline flex items-center justify-end gap-1">
                                        <i class="bi bi-box"></i> {log.item.id}
                                    </a>
                                {:else}
                                    <span class="text-xs text-gray-400">System</span>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>