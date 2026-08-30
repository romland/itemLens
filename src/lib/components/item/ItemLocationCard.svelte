<script lang="ts">
    import { enhance } from '$app/forms';
    import { notify } from '$lib/client/notifications';
    import ContainerSelector from '$lib/components/ContainerSelector.svelte';
    import { ambientLocation } from '$lib/client/ambientContext';

    export let item: any;
    export let canEdit: boolean = false;
    export let itemCategories: string[] = [];

    let moveModal: HTMLDialogElement;
    let isMoving = false;
    let globalContainers: any[] = [];
    let isLoadingContainers = false;

    async function openMoveModal() {
        if (!moveModal) return;
        moveModal.showModal();
        if (globalContainers.length === 0) {
            isLoadingContainers = true;
            try {
                const res = await fetch('/api/containers');
                if (res.ok) globalContainers = await res.json();
            } finally { isLoadingContainers = false; }
        }
    }

    async function quickMove(newContainer: string) {
        if (!item?.id) return;
        isMoving = true;
        try {
            const res = await fetch('/api/item', { 
                method: 'PATCH', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ itemId: item.id, newContainer }) 
            });
            if (res.ok) {
                notify('success', `Moved to ${newContainer}`);
                window.location.reload();
            } else notify('error', 'Failed to move item.');
        } catch (e) { notify('error', 'Network error.'); } 
        finally { isMoving = false; moveModal.close(); }
    }
</script>

<form id="incStockForm" method="POST" action="?/incStock" style="display: none;" use:enhance={() => {
    if (item.amount === null) item.amount = 1; else item.amount += 1;
    return async ({ update }) => { await update({ reset: false }); notify('success', 'Stock increased (+1)'); };
}}>
    <button id="incStockBtn" type="submit"></button>
</form>
<form id="decStockForm" method="POST" action="?/decStock" style="display: none;" use:enhance={() => {
    if (item.amount !== null && item.amount > 0) item.amount -= 1;
    return async ({ update }) => { await update({ reset: false }); notify('info', 'Stock decreased (-1)'); };
}}>
    <button id="decStockBtn" type="submit"></button>
</form>

<!-- MOBILE ONLY: Compact Side-by-Side Row -->
<div class="md:hidden bg-base-100 shadow-sm border border-base-200 rounded-xl p-3 flex flex-col gap-3">
    <div class="flex items-center gap-3">
        <div class="flex flex-col justify-center bg-base-200/60 px-2 py-2 rounded-xl text-center shrink-0 min-w-[4.5rem]">
            <div class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Stock</div>
            <div class="text-2xl font-bold leading-tight flex items-center justify-center gap-1">
                {#if item?.inventory?.enableQuickStock && canEdit}
                    <button class="btn btn-xs btn-ghost p-0 w-5 h-5 -ml-1" on:click={() => document.getElementById('decStockBtn')?.click()}><i class="bi bi-dash"></i></button>
                {/if}
                <span>{item.amount !== null ? item.amount : '-'}</span>
                {#if item?.inventory?.enableQuickStock && canEdit}
                    <button class="btn btn-xs btn-ghost p-0 w-5 h-5 -mr-1" on:click={() => document.getElementById('incStockBtn')?.click()}><i class="bi bi-plus"></i></button>
                {/if}
            </div>
        </div>

        {#if item.locations?.[0]}
            {@const loc = item.locations[0]}
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-base-200 bg-base-50 flex items-center justify-center">
                    {#if loc.container.parent?.photoPath}
                        <img class="w-full h-full object-cover" src="{loc.container.parent.photoPath.replace(/\.[^/.]+$/, '_thumb.webp')}" alt="Parent container" on:error={(e) => { if (!(e.currentTarget).dataset.fb) { (e.currentTarget).dataset.fb = '1'; (e.currentTarget).src = loc.container.parent.photoPath; } }}/>
                    {:else if loc.container?.photoPath}
                        <img class="w-full h-full object-cover" src="{loc.container.photoPath.replace(/\.[^/.]+$/, '_thumb.webp')}" alt="Container thumbnail" on:error={(e) => { if (!(e.currentTarget).dataset.fb) { (e.currentTarget).dataset.fb = '1'; (e.currentTarget).src = loc.container.photoPath; } }}/>
                    {:else}
                        <i class="bi bi-box-seam text-2xl text-gray-400"></i>
                    {/if}
                </div>
                <div class="flex flex-col justify-center min-w-0">
                    <div class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold leading-none mb-0.5">Location</div>
                    <a href="/container/{encodeURIComponent(loc.container.name)}" class="font-bold text-sm leading-tight truncate hover:text-primary hover:underline">{loc.container.name}</a>
                    <div class="text-xs text-gray-500 leading-snug line-clamp-1 mt-0.5">{loc.container?.parent?.description || loc.container?.description || 'No description'}</div>
                </div>
            </div>
        {:else}
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-dashed border-base-300 bg-base-50 flex items-center justify-center">
                    <i class="bi bi-pin-map text-2xl text-gray-400"></i>
                </div>
                <div class="flex flex-col justify-center min-w-0">
                    <div class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold leading-none mb-0.5">Location</div>
                    <div class="font-bold text-sm leading-tight truncate text-warning">Unassigned</div>
                    {#if canEdit}
                        <button class="text-[11px] font-bold text-primary hover:underline text-left mt-0.5 w-max shrink-0 whitespace-nowrap" on:click={openMoveModal}>+ Assign</button>
                    {/if}
                </div>
            </div>
        {/if}
    </div>

    {#if item.locations?.length > 1 || item.reason}
        <div class="divider m-0 h-0"></div>
        <div class="flex flex-col gap-1.5 text-xs">
            {#if item.reason}<div><span class="font-semibold text-gray-500 uppercase">Reason:</span> {item.reason}</div>{/if}
            {#if item.locations?.length > 1}
                <div class="text-gray-500 font-semibold uppercase text-[10px] mt-0.5">Other Locations:</div>
                <div class="flex flex-wrap gap-1">
                    {#each item.locations.slice(1) as loc}
                        <a href="/container/{encodeURIComponent(loc.container.name)}" class="badge badge-ghost badge-sm hover:border-primary hover:text-primary transition-colors">{loc.container.name}</a>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>

<!-- DESKTOP ONLY: Stacked Layout -->
<div class="hidden md:flex flex-col gap-4">
    <div class="stats shadow w-full">
        <div class="stat">
            <div class="stat-title"><span class="text-xs">Stock</span></div>
            <div class="stat-value text-secondary flex items-center gap-2">
                {#if item?.inventory?.enableQuickStock && canEdit}
                    <button class="btn btn-sm btn-ghost p-0 w-8 h-8" on:click={() => document.getElementById('decStockBtn')?.click()}><i class="bi bi-dash"></i></button>
                {/if}
                <span>{#if item.amount !== null}{item.amount}{:else}-{/if}</span>
                {#if item?.inventory?.enableQuickStock && canEdit}
                    <button class="btn btn-sm btn-ghost p-0 w-8 h-8" on:click={() => document.getElementById('incStockBtn')?.click()}><i class="bi bi-plus"></i></button>
                {/if}
            </div>
            <div class="stat-desc">&nbsp;</div>
        </div>
    </div>

    {#if !item.locations || item.locations.length === 0}
        <div class="card bg-base-100 shadow-sm border border-dashed border-base-300 w-full overflow-hidden">
            <figure class="w-full h-20 border-b border-dashed border-base-300 bg-base-50 m-0 flex items-center justify-center">
                <i class="bi bi-pin-map text-4xl text-gray-400"></i>
            </figure>
            <div class="card-body p-4 gap-1 relative">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Location</div>
                        <div class="card-title text-lg m-0 text-warning leading-none">Unassigned</div>
                    </div>
                    {#if canEdit}
                        <button class="btn btn-sm btn-outline border-base-300 rounded-xl hover:border-primary text-xs shrink-0 whitespace-nowrap" on:click={openMoveModal}>
                            <i class="bi bi-pin-map-fill"></i> Assign
                        </button>
                    {/if}
                </div>
                <p class="text-sm text-gray-500 m-0 mt-1">This does not have a home.</p>
            </div>
        </div>
    {/if}

    {#each item.locations || [] as loc, i}
        <div class="card bg-base-100 shadow-sm border border-base-200 w-full overflow-hidden">
            {#if i === 0}
                <figure class="w-full h-20 border-b border-base-200 bg-base-200 m-0">
                    {#if loc.container.parent?.photoPath}
                        <img class="w-full h-full object-cover object-top" src="{loc.container.parent.photoPath.replace(/\.[^/.]+$/, '_thumb.webp')}" alt="Parent container" on:error={(e) => { if (!(e.currentTarget).dataset.fb) { (e.currentTarget).dataset.fb = '1'; (e.currentTarget).src = loc.container.parent.photoPath; } }}/>
                    {:else if loc.container?.photoPath}
                        <img class="w-full h-full object-cover object-top" src="{loc.container.photoPath.replace(/\.[^/.]+$/, '_thumb.webp')}" alt="Container thumbnail" on:error={(e) => { if (!(e.currentTarget).dataset.fb) { (e.currentTarget).dataset.fb = '1'; (e.currentTarget).src = loc.container.photoPath; } }}/>
                    {:else}
                        <div class="w-full h-full flex items-center justify-center"><i class="bi bi-box-seam text-4xl text-gray-400"></i></div>
                    {/if}
                </figure>
            {/if}
            <div class="card-body p-4 gap-1 relative">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Location {i > 0 ? `#${i+1}` : ''}</div>
                        <a href="/container/{encodeURIComponent(loc.container.name)}" class="card-title text-lg m-0 hover:text-primary hover:underline w-max">{loc.container.name}</a>
                    </div>
                    <button class="btn btn-sm btn-outline border-base-300 rounded-xl hover:border-primary text-xs" on:click={openMoveModal}>
                        <i class="bi bi-arrows-move"></i> Move it
                    </button>
                </div>
                <p class="text-sm text-gray-600 m-0">{loc.container?.parent?.description || loc.container?.description || 'No description'}</p>
            </div>
        </div>
    {/each}

    {#if item.reason}
        <div class="mb-3 text-sm">Reason: {item.reason}<br/></div>
    {/if}
</div>

<!-- Tags & Categories -->
{#if (item?.tags && item.tags.length > 0) || itemCategories.length > 0}
    <div class="flex flex-wrap justify-start gap-2 mt-4 md:mt-1">
        {#each itemCategories as cat}
            <div class="badge badge-primary badge-outline badge-sm shadow-sm">
                <a href="/search?category={encodeURIComponent(cat)}">{cat}</a>
            </div>
        {/each}
        {#each item?.tags || [] as tag}
            <div class="badge badge-ghost badge-sm hover:border-primary hover:text-primary transition-colors">
                <a href="/tag/{tag.slug}">{tag.name}</a>
            </div>
        {/each}
    </div>
{/if}

<dialog bind:this={moveModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box p-4 bg-base-100 shadow-2xl border border-base-200 sm:rounded-[2.5rem]">
        <h3 class="font-bold text-xl mb-1 flex items-center gap-2"><i class="bi bi-arrows-move text-primary"></i> Move Item</h3>
        <p class="text-xs text-gray-500 mb-4">Select the new container for this item.</p>
        {#if isLoadingContainers}
            <div class="flex justify-center p-8"><span class="loading loading-spinner text-primary"></span></div>
        {:else}
            <ContainerSelector containers={globalContainers} defaultTab="select" on:change={(e) => { if (e.detail.containers.length > 0) quickMove(e.detail.containers[0]); }} />
        {/if}
    </div>
    <form method="dialog" class="modal-backdrop"><button disabled={isMoving}>close</button></form>
</dialog>