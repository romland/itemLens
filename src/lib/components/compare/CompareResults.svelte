<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { goto } from '$app/navigation';
    import ImageLightbox from '$lib/components/ImageLightbox.svelte';

    export let results: {
        draftPath: string;
        totalDetected: number;
        inCollection: any[];
        newToYou: any[];
        missingFromScope: any[];
    };

    const dispatch = createEventDispatcher();
    let activeTab: 'new' | 'owned' | 'missing' = results.newToYou.length > 0 ? 'new' : 'owned';
    let savingTitles: Set<string> = new Set();
    let lightbox: ImageLightbox;
   let mergeModal: HTMLDialogElement;
   let mergeSourceItem: any = null;

    async function quickAdd(item: any, target: 'inventory' | 'to buy' | 'todo') {
        savingTitles.add(item.title);
        savingTitles = savingTitles;

        try {
            const fd = new FormData();
            let res;
            if (target === 'inventory') {
                fd.append('title', item.title);
                if (item.subtitle) fd.append('description', item.subtitle);
                if (results.draftPath) fd.append('draftPath', results.draftPath);
                if (item.box) fd.append('box', JSON.stringify(item.box));
                res = await fetch('/api/item', { method: 'POST', body: fd });
            } else {
                fd.append('content', `${target === 'to buy' ? 'Buy: ' : 'Task: '} ${item.title} ${item.subtitle ? `(${item.subtitle})` : ''}`);
                fd.append('category', target);
                res = await fetch('/timeline?/capture', { method: 'POST', body: fd, headers: { 'x-sveltekit-action': 'true', 'accept': 'application/json' } });
            }

            if (res.ok) {
                dispatch('notify', { status: 'success', message: `Added "${item.title}" to ${target === 'inventory' ? 'Inventory' : 'Notebook'}` });
                results.newToYou = results.newToYou.filter(i => i.title !== item.title);
                if (target === 'inventory') results.inCollection = [{ ...item, matchedItem: { title: item.title, amount: 1 } }, ...results.inCollection];
            }
        } catch (e) {
            dispatch('notify', { status: 'error', message: 'Failed to add item.' });
        } finally {
            savingTitles.delete(item.title);
            savingTitles = savingTitles;
        }
    }

   function confirmMerge(dbItem: any) {
       if (!mergeSourceItem) return;
       
       results.newToYou = results.newToYou.filter(i => i.title !== mergeSourceItem.title);
       results.missingFromScope = results.missingFromScope.filter(i => i.id !== dbItem.id);
       
       results.inCollection = [{ 
           ...mergeSourceItem, 
           matchedItem: { id: dbItem.id, title: dbItem.title, slug: dbItem.slug, locationName: dbItem.locationName } 
       }, ...results.inCollection];

       mergeModal.close();
       mergeSourceItem = null;
       dispatch('notify', { status: 'success', message: 'Match linked successfully!' });
   }
</script>

<div class="flex flex-col gap-4 w-full max-w-lg mx-auto animate-fade-in pb-24">
    <!-- Summary Segmented Tabs -->
    <div class="flex bg-base-200/80 p-1 rounded-2xl border border-base-300">
        <button type="button" class="btn btn-sm flex-1 rounded-xl border-none transition-all flex items-center justify-center gap-1.5 {activeTab === 'new' ? 'bg-base-100 shadow text-primary font-bold' : 'btn-ghost text-gray-500'}" on:click={() => activeTab = 'new'}>
            <span>✨ New</span>
            <span class="badge badge-sm badge-primary badge-outline font-bold">{results.newToYou.length}</span>
        </button>
        <button type="button" class="btn btn-sm flex-1 rounded-xl border-none transition-all flex items-center justify-center gap-1.5 {activeTab === 'owned' ? 'bg-base-100 shadow text-success font-bold' : 'btn-ghost text-gray-500'}" on:click={() => activeTab = 'owned'}>
            <span>✓ In Library</span>
            <span class="badge badge-sm badge-ghost font-bold">{results.inCollection.length}</span>
        </button>
        {#if results.missingFromScope.length > 0}
            <button type="button" class="btn btn-sm flex-1 rounded-xl border-none transition-all flex items-center justify-center gap-1.5 {activeTab === 'missing' ? 'bg-base-100 shadow text-error font-bold' : 'btn-ghost text-gray-500'}" on:click={() => activeTab = 'missing'}>
                <span>⚠️ Missing</span>
                <span class="badge badge-sm badge-error badge-outline font-bold">{results.missingFromScope.length}</span>
            </button>
        {/if}
    </div>

    <!-- NEW TO YOU CARDS -->
    {#if activeTab === 'new'}
        <div class="flex flex-col gap-2.5">
            {#each results.newToYou as item}
                {@const ymin = Math.max(0, (item.box?.[0] || 0) - 25)}
                {@const xmin = Math.max(0, (item.box?.[1] || 0) - 25)}
                {@const ymax = Math.min(1000, (item.box?.[2] || 1000) + 25)}
                {@const xmax = Math.min(1000, (item.box?.[3] || 1000) + 25)}
                {@const w = Math.max(1, xmax - xmin)}
                {@const h = Math.max(1, ymax - ymin)}
                <div class="bg-base-100 border border-base-200 p-4 rounded-2xl shadow-sm flex items-center justify-between gap-3 hover:border-primary/40 transition-all">
                    {#if item.box}
                        <button type="button" class="relative w-16 h-20 overflow-hidden rounded-lg shrink-0 bg-base-300 border-none p-0 cursor-zoom-in block" on:click|stopPropagation={() => lightbox.open({ orgPath: results.draftPath, thumbPath: results.draftPath, showOriginal: true, box: item.box })}>
                            <img src="{results.draftPath}" class="absolute max-w-none origin-top-left object-cover"
                                 style="width: {100000 / w}%; height: {100000 / h}%; left: -{(xmin / w) * 100}%; top: -{(ymin / h) * 100}%;" 
                                 alt="{item.title}" />
                        </button>
                    {/if}
                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="font-bold text-base-content text-sm leading-tight truncate">{item.title}</span>
                        {#if item.subtitle}
                            <span class="text-xs text-gray-500 truncate mt-0.5">{item.subtitle}</span>
                        {/if}
                        <span class="badge badge-ghost badge-xs text-[10px] uppercase font-bold mt-2 w-max text-primary/80 bg-primary/10 border-none">Not in Inventory</span>
                    </div>
                    <div class="dropdown dropdown-end">
                        <label tabindex="0" class="btn btn-sm btn-primary rounded-xl shadow-sm shrink-0 gap-1 {savingTitles.has(item.title) ? 'btn-disabled' : ''}">
                            {#if savingTitles.has(item.title)}
                                <span class="loading loading-spinner loading-xs"></span>
                            {:else}
                                <i class="bi bi-plus-lg"></i> Add
                            {/if}
                        </label>
                        <ul tabindex="0" class="dropdown-content z-[10] menu p-2 shadow-2xl bg-base-100 rounded-box w-52 border border-base-200 mt-2 gap-1">
                            <li class="menu-title px-4 py-2 text-[10px] uppercase font-bold text-gray-400">Add to...</li>
                            <li><button type="button" class="font-medium hover:text-primary" on:click={() => quickAdd(item, 'inventory')}><i class="bi bi-box-seam opacity-70"></i> Inventory</button></li>
                            <li><button type="button" class="font-medium hover:text-primary" on:click={() => quickAdd(item, 'to buy')}><i class="bi bi-cart opacity-70"></i> Shopping List</button></li>
                            <li><button type="button" class="font-medium hover:text-primary" on:click={() => quickAdd(item, 'todo')}><i class="bi bi-list-check opacity-70"></i> To-Do List</button></li>
                           {#if results.missingFromScope.length > 0}
                               <li class="divider my-0 h-[1px] bg-base-200"></li>
                               <li><button type="button" class="font-medium text-warning hover:text-warning" on:click={() => { mergeSourceItem = item; mergeModal.showModal(); }}><i class="bi bi-link-45deg opacity-70"></i> Link to Existing...</button></li>
                           {/if}
                        </ul>
                    </div>
                </div>
            {:else}
                <div class="text-center p-8 bg-base-200/40 rounded-3xl text-gray-400 flex flex-col items-center">
                    <i class="bi bi-check2-all text-4xl mb-2 text-success"></i>
                    <p class="font-medium text-sm">You already own everything detected in this photo!</p>
                </div>
            {/each}
        </div>
    {:else if activeTab === 'owned'}
        <div class="flex flex-col gap-2.5">
            {#each results.inCollection as item}
                {@const ymin = Math.max(0, (item.box?.[0] || 0) - 25)}
                {@const xmin = Math.max(0, (item.box?.[1] || 0) - 25)}
                {@const ymax = Math.min(1000, (item.box?.[2] || 1000) + 25)}
                {@const xmax = Math.min(1000, (item.box?.[3] || 1000) + 25)}
                {@const w = Math.max(1, xmax - xmin)}
                {@const h = Math.max(1, ymax - ymin)}
                <div class="bg-base-100 border border-base-200 p-4 rounded-2xl shadow-sm flex items-center justify-between gap-3 opacity-90">
                    {#if item.box}
                        <button type="button" class="relative w-16 h-20 overflow-hidden rounded-lg shrink-0 bg-base-300 border-none p-0 cursor-zoom-in block" on:click|stopPropagation={() => lightbox.open({ orgPath: results.draftPath, thumbPath: results.draftPath, showOriginal: true, box: item.box })}>
                            <img src="{results.draftPath}" class="absolute max-w-none origin-top-left object-cover"
                                 style="width: {100000 / w}%; height: {100000 / h}%; left: -{(xmin / w) * 100}%; top: -{(ymin / h) * 100}%;" 
                                 alt="{item.title}" />
                        </button>
                    {/if}
                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="font-bold text-base-content text-sm leading-tight truncate">{item.title}</span>
                        {#if item.subtitle}
                            <span class="text-xs text-gray-500 truncate mt-0.5">{item.subtitle}</span>
                        {/if}
                        <div class="flex items-center gap-2 mt-2">
                            <span class="badge badge-success badge-sm text-[10px] uppercase font-bold text-white"><i class="bi bi-check-lg mr-1"></i> Owned</span>
                            {#if item.matchedItem?.locationName}
                                <span class="badge badge-ghost badge-sm text-xs font-mono"><i class="bi bi-box-seam mr-1 text-gray-400"></i> {item.matchedItem.locationName}</span>
                            {/if}
                        </div>
                    </div>
                    {#if item.matchedItem?.id}
                        <a href="/{item.matchedItem.id}/{item.matchedItem.slug || 'view'}" class="btn btn-circle btn-ghost btn-sm text-gray-400 hover:text-primary">
                            <i class="bi bi-arrow-right-short text-2xl"></i>
                        </a>
                    {/if}
                </div>
            {/each}
        </div>
    {:else if activeTab === 'missing'}
        <div class="flex flex-col gap-2.5">
            {#each results.missingFromScope as item}
                <div class="bg-base-100 border border-error/20 p-4 rounded-2xl shadow-sm flex items-center justify-between gap-3">
                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="font-bold text-base-content text-sm leading-tight truncate">{item.title}</span>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="badge badge-error badge-outline badge-sm text-[10px] uppercase font-bold">Missing from Scan</span>
                            {#if item.locationName}
                                <span class="text-[10px] text-gray-400">Last in: {item.locationName}</span>
                            {/if}
                        </div>
                    </div>
                    <a href="/{item.id}/{item.slug || 'view'}" class="btn btn-ghost btn-xs text-error">View</a>
                </div>
            {/each}
        </div>
    {/if}
</div>

<ImageLightbox bind:this={lightbox} itemTitle="Comparison Match" />

<!-- Manual Link Assistant Modal -->
<dialog bind:this={mergeModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm" on:close={() => mergeSourceItem = null}>
   <div class="modal-box sm:rounded-[2.5rem] p-0 bg-base-100 shadow-2xl border border-base-200 overflow-hidden flex flex-col max-h-[80vh]">
       <div class="p-6 pb-4 border-b border-base-200 bg-base-100/90 sticky top-0 z-10">
           <h3 class="font-bold text-lg leading-tight">Link to Existing Item</h3>
           <p class="text-xs text-gray-500 mt-1">Select the inventory item that matches "{mergeSourceItem?.title}"</p>
       </div>
       <div class="overflow-y-auto p-4 flex flex-col gap-2">
           {#each results.missingFromScope as missingItem}
               <button type="button" class="btn btn-ghost h-auto py-3 px-4 w-full justify-start text-left border border-base-200 shadow-sm hover:border-warning hover:bg-warning/10 rounded-2xl flex-col items-start gap-1" on:click={() => confirmMerge(missingItem)}>
                   <span class="font-bold text-sm text-base-content whitespace-normal">{missingItem.title}</span>
                   {#if missingItem.locationName}
                       <span class="text-[10px] text-gray-400 font-medium font-mono uppercase"><i class="bi bi-box-seam mr-1"></i> {missingItem.locationName}</span>
                   {/if}
               </button>
           {/each}
       </div>
       <div class="p-4 pt-2 border-t border-base-200">
           <button type="button" class="btn btn-neutral w-full rounded-xl" on:click={() => mergeModal.close()}>Cancel</button>
       </div>
   </div>
   <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
