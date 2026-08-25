<!-- src/lib/components/DuplicateResolution.svelte -->
<script lang="ts">
    import ItemMiniCard from './ItemMiniCard.svelte';
    import { createEventDispatcher } from 'svelte';
    import RelativeDate from './RelativeDate.svelte';
    import ColorMixBar from './ColorMixBar.svelte';

    export let scannedTitle: string;
    export let matchDetails: any; // ID, title, locationName, sharedAttributes
    export let scannedItem: any = null;
    export let scannedCreatedAt: string | null = null;
    export let isAfterTheFact: boolean = false;
    export let currentAction: 'new' | 'merge' | 'ignore' | 'prompt' | null = null;

    const dispatch = createEventDispatcher();
    import { copyDuplicateDebugPayload } from '$lib/client/utils';

    function dumpDebug() {
        copyDuplicateDebugPayload(`${scannedTitle} vs ${matchDetails?.title}`, scannedItem, matchDetails);
    }
</script>

<div class="flex flex-col gap-4 bg-base-100/50 p-3 rounded-2xl border border-warning/30 shadow-inner">
    <div class="bg-warning/10 border border-warning/30 rounded-xl p-3">
        <div class="flex justify-between items-start mb-1.5">
            <h3 class="font-bold text-warning-content text-xs flex items-center gap-2">
                <i class="bi bi-intersect text-warning"></i> Potential Duplicate
            </h3>
            <button type="button" class="btn btn-xs btn-ghost text-warning hover:bg-warning/20 p-1 h-auto min-h-0" on:click={dumpDebug} title="Dump debug data to console">
                <i class="bi bi-bug-fill text-sm"></i>
            </button>
        </div>
        <p class="text-[11px] text-base-content/80 mb-2 leading-tight">
            We found an existing item that matches <strong>{scannedTitle}</strong>.
        </p>

        <div class="bg-base-100 shadow-sm rounded-lg overflow-hidden">
            <ItemMiniCard item={matchDetails} on:zoom={() => dispatch('zoom', matchDetails)} />
        </div>

        <div class="mt-3 pt-2 border-t border-warning/20 flex flex-col gap-1.5">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center text-[10px] gap-0.5 sm:gap-0">
                <span class="text-gray-500 font-bold uppercase tracking-wider">Original Added:</span>
                <span class="font-medium text-base-content/80"><RelativeDate date={matchDetails?.createdAt} /></span>
            </div>
            {#if scannedCreatedAt}
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center text-[10px] gap-0.5 sm:gap-0">
                <span class="text-gray-500 font-bold uppercase tracking-wider">This Scan Added:</span>
                <span class="font-medium text-base-content/80"><RelativeDate date={scannedCreatedAt} /></span>
            </div>
            {/if}
            {#if matchDetails?.dbAttributes?.length > 0}
            <div class="flex flex-col gap-1 mt-2">
                <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Existing Attributes:</span>
                <div class="flex flex-wrap gap-1">
                    {#each matchDetails.dbAttributes as attr}
                        {#if attr.key === 'color_mix'}
                            <div class="w-full my-0.5"><ColorMixBar colorMixStr={attr.value} /></div>
                        {:else}
                            <span class="badge badge-warning badge-outline text-[9px] font-mono h-auto py-0.5">{attr.key}: {attr.value}</span>
                        {/if}
                    {/each}
                </div>
            </div>
            {/if}
        </div>
    </div>

    <div class="flex flex-col gap-2">
        <button type="button" class="btn btn-outline h-auto py-2.5 px-3 w-full flex justify-start items-center rounded-xl transition-all {currentAction === 'merge' ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50'}" on:click={() => dispatch('resolve', 'merge')}>
            <div class="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center mr-3 shrink-0"><i class="bi bi-plus-slash-minus text-xs"></i></div>
            <div class="text-left flex-1 min-w-0">
                <div class="font-bold text-xs leading-tight">Merge (+1)</div>
                <div class="text-[10px] text-gray-500 font-normal truncate">Bump quantity & link box</div>
            </div>
            {#if currentAction === 'merge'}<i class="bi bi-check-circle-fill text-primary ml-auto text-lg"></i>{/if}
        </button>

        <button type="button" class="btn btn-outline h-auto py-2.5 px-3 w-full flex justify-start items-center rounded-xl transition-all {currentAction === 'new' ? 'border-info bg-info/10' : 'border-base-300 hover:border-info/50'}" on:click={() => dispatch('resolve', 'new')}>
            <div class="w-6 h-6 rounded-full bg-info/20 text-info flex items-center justify-center mr-3 shrink-0"><i class="bi bi-file-earmark-plus text-xs"></i></div>
            <div class="text-left flex-1 min-w-0">
                <div class="font-bold text-xs leading-tight">{isAfterTheFact ? 'Keep as Distinct' : 'Save as Distinct'}</div>
                <div class="text-[10px] text-gray-500 font-normal truncate">{isAfterTheFact ? 'Leave as a separate physical item' : 'Track as a separate item'}</div>
            </div>
            {#if currentAction === 'new'}<i class="bi bi-check-circle-fill text-info ml-auto text-lg"></i>{/if}
        </button>

        <button type="button" class="btn btn-outline h-auto py-2.5 px-3 w-full flex justify-start items-center rounded-xl transition-all {currentAction === 'ignore' ? 'border-error bg-error/10' : 'border-base-300 hover:border-error/50'}" on:click={() => dispatch('resolve', 'ignore')}>
            <div class="w-6 h-6 rounded-full bg-error/20 text-error flex items-center justify-center mr-3 shrink-0"><i class="bi bi-trash3 text-xs"></i></div>
            <div class="text-left flex-1 min-w-0">
                <div class="font-bold text-xs leading-tight">{isAfterTheFact ? 'Delete Duplicate' : 'Ignore'}</div>
                <div class="text-[10px] text-gray-500 font-normal truncate">{isAfterTheFact ? 'Vaporize this anomaly' : 'Drop from this import'}</div>
            </div>
            {#if currentAction === 'ignore'}<i class="bi bi-check-circle-fill text-error ml-auto text-lg"></i>{/if}
        </button>
    </div>
</div>