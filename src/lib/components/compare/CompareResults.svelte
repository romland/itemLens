<script lang="ts">
    import ImageLightbox from "$lib/components/ImageLightbox.svelte";
    import { createEventDispatcher, onMount } from 'svelte';
    import { beforeNavigate } from '$app/navigation';
    import ARImagePreview from './ARImagePreview.svelte';
    import CompareEmptyState from './CompareEmptyState.svelte';
    import CompareItemCard from './CompareItemCard.svelte';

    export let results: {
        draftPath: string;
        totalDetected: number;
        inCollection: any[];
        newToYou: any[];
        missingFromScope: any[];
        scopeType?: string;
        scopeValue?: string;
    };
    export let containers: any[] = [];
    export let categories: any[] = [];
    export let tags: any[] = [];

    const dispatch = createEventDispatcher();
    let savingTitles: Set<string> = new Set();
    let lightbox: ImageLightbox;
    let mergeModal: HTMLDialogElement;
    let mergeSourceItem: any = null;
    let filterModal: HTMLDialogElement;
    let isRefiltering = false;
    let autoGuessed = false;
    let strictAuditMode = false;

    let actionModal: HTMLDialogElement;
    let actionItem: any = null;

    $: scopeType = results.scopeType || 'all';
    $: scopeValue = results.scopeValue || '';
    
    const normalizeStr = (s: string) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    // The Stacking Engine
    function groupDetected(items: any[]) {
        const groups: any = {};
        for (const item of items) {
            const key = normalizeStr(item.matchedItem ? item.matchedItem.title : item.title);
            if (!groups[key]) groups[key] = { ...item, count: 0 };
            groups[key].count++;
        }
        return Object.values(groups);
    }

    // Raw flat arrays needed for the bulk action footers
    $: unregistered = results.newToYou || [];
    $: correct = (results.inCollection || []).filter(i => scopeType !== 'container' || i.matchedItem?.locationName === scopeValue);
    $: elsewhere = (results.inCollection || []).filter(i => scopeType === 'container' && i.matchedItem?.locationName !== scopeValue);

    // Compute human-intent categories (Grouped for Stacking)
    $: groupedUnregistered = groupDetected(results.newToYou || []);
    $: groupedCorrect = groupDetected(correct);
    $: groupedElsewhere = groupDetected(elsewhere);

    // Consolidate completely missing items
    $: completelyMissing = (() => {
        const groups: any = {};
        for (const m of (results.missingFromScope || [])) {
            const norm = normalizeStr(m.title);

            // If we found AT LEAST ONE in the photo, the shortfalls logic handles it. Skip here!
            if ((results.inCollection || []).some(c => normalizeStr(c.matchedItem.title) === norm)) continue;

            if (!groups[norm]) groups[norm] = { ...m, expected: 0, count: 0 };
            groups[norm].expected += (m.amount || 1);
        }
        return Object.values(groups);
    })();

    // Audit missing items (calculate shortfalls)
    $: missingShortfalls = (() => {
        if (!strictAuditMode) return [];
        const allMatchedGroups = groupDetected(results.inCollection || []);
        const shortfalls = [];
        for (const mg of (allMatchedGroups as any[])) {
            const expected = mg.matchedItem.dbTotalAmount || 1;
            if (mg.count < expected) {
                shortfalls.push({
                    id: mg.matchedItem.id,
                    title: mg.matchedItem.title,
                    slug: mg.matchedItem.slug,
                    locationName: mg.matchedItem.locationName,
                    expected: expected,
                    count: mg.count,
                    isShortfall: true,
                    box: mg.box
                });
            }
        }
        return shortfalls;
    })();

    // Final Missing List
    $: missing = [...completelyMissing, ...missingShortfalls];

    let activeTab: 'unregistered' | 'missing' | 'elsewhere' | 'correct' = 'unregistered';
    
    // Late binding logic: Auto-select the most emotionally relevant tab upon scan completion
    $: if (results) {
        if (scopeType === 'all') activeTab = (results.newToYou?.length || 0) > 0 ? 'unregistered' : 'correct';
        else activeTab = missing.length > 0 ? 'missing' : (groupedElsewhere.length > 0 ? 'elsewhere' : (groupedUnregistered.length > 0 ? 'unregistered' : 'correct'));
    }

    onMount(() => {
        // Auto-guess intent if the user didn't pre-filter
        if (results.scopeType === 'all' && (results.inCollection.length > 0 || results.newToYou.length > 0)) {
            const catCounts: Record<string, number> = {};
            const locCounts: Record<string, number> = {};
            
            const allDetected = [...results.inCollection, ...results.newToYou];
            
            allDetected.forEach(i => {
                const cat = i.category?.toLowerCase();
                if (cat) catCounts[cat] = (catCounts[cat] || 0) + 1;
            });
            results.inCollection.forEach(i => {
                const loc = i.matchedItem?.locationName;
                if (loc) locCounts[loc] = (locCounts[loc] || 0) + 1;
            });
            
            let bestCat = '', bestLoc = '';
            let maxCat = 0, maxLoc = 0;
            
            for (const [k, v] of Object.entries(catCounts)) if (v > maxCat) { maxCat = v; bestCat = k; }
            for (const [k, v] of Object.entries(locCounts)) if (v > maxLoc) { maxLoc = v; bestLoc = k; }

            // If >50% of detected items belong to a known category, auto-scope to it!
            if (maxCat >= allDetected.length / 2 && maxCat > 0) {
                const realCat = categories.find(c => c.name.toLowerCase() === bestCat);
                if (realCat) { autoGuessed = true; updateScope('category', realCat.name); return; }
            }
            
            // Fallback: If >50% of matched items are in one specific box, auto-scope to it!
            if (maxLoc >= results.inCollection.length / 2 && maxLoc > 0) {
                const realLoc = containers.find(c => c.name === bestLoc);
                if (realLoc) { autoGuessed = true; updateScope('container', realLoc.name); return; }
            }
        }
    });

    // Map state to colors for AR glowing boxes
    $: arBoxes = [
        ...unregistered.map(i => ({ box: i.box, colorClass: 'border-primary shadow-[0_0_15px_rgba(var(--p),0.8)]', id: i.title })),
        ...elsewhere.map(i => ({ box: i.box, colorClass: 'border-warning shadow-[0_0_15px_rgba(var(--wa),0.8)]', id: i.title })),
        ...correct.map(i => ({ box: i.box, colorClass: 'border-success shadow-[0_0_15px_rgba(var(--su),0.8)]', id: i.title }))
    ];

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
                if (scopeType === 'container' && scopeValue) fd.append('container', scopeValue);
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

    async function quickMove(itemId: number, newContainer: string) {
        try {
            await fetch('/api/item', { 
                method: 'PATCH', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ itemId, newContainer }) 
            });
        } catch (e) {
            dispatch('notify', { status: 'error', message: 'Failed to move item.' });
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

   async function updateScope(type: string, value: string) {
       filterModal.close();
       if (type === scopeType && value === scopeValue) return;
       
       isRefiltering = true;
       autoGuessed = false; // User manually intervened
       scopeType = type;
       scopeValue = value;
       results.scopeType = type;
       results.scopeValue = value;

       const matchedIds = results.inCollection.map(i => i.matchedItem.id);
       const res = await fetch('/api/compare-missing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopeType, scopeValue, matchedIds }) });
       if (res.ok) {
           const data = await res.json();
           results.missingFromScope = data.missing;
       }
       isRefiltering = false;
   }
</script>

<div class="flex flex-col gap-4 w-full max-w-lg mx-auto animate-fade-in pb-32">

    <!-- The "Mad Libs" Sentence (Natural Language Scope) -->
    <div class="flex justify-center -mb-2 z-10 relative text-sm text-gray-500 px-4 text-center">
        <span>
            {#if autoGuessed}
                <i class="bi bi-magic text-warning mr-1"></i> Auto-comparing against 
            {:else}
                Comparing against 
            {/if}
            <button class="font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors px-2 py-0.5 rounded ml-1" on:click={() => filterModal.showModal()}>
                {scopeType === 'all' ? 'Entire Library' : scopeValue} <i class="bi bi-chevron-down text-xs ml-1"></i>
            </button>
        </span>
    </div>

    <ARImagePreview src={results.draftPath} boxes={arBoxes} on:clickBox={(e) => {
        const title = e.detail;
        if (unregistered.some(i => i.title === title)) activeTab = 'unregistered';
        else if (elsewhere.some(i => i.title === title)) activeTab = 'elsewhere';
        else activeTab = 'correct';
        
        setTimeout(() => {
            document.getElementById('card-' + title.replace(/\s+/g, '-'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    }} />

    <div class="grid {scopeType === 'container' ? 'grid-cols-2 md:grid-cols-4' : (scopeType !== 'all' ? 'grid-cols-3' : 'grid-cols-2')} gap-1 bg-base-200/80 p-1 rounded-2xl border border-base-300 w-full">
        {#if scopeType !== 'all'}
            <button type="button" class="btn btn-sm h-auto py-2 flex-1 min-w-[130px] rounded-xl border-none transition-all flex flex-wrap items-center justify-center gap-1 {activeTab === 'missing' ? 'bg-base-100 shadow-sm text-error font-bold' : 'btn-ghost text-gray-500 font-medium hover:bg-base-300/50'}" on:click={() => activeTab = 'missing'}>
                <span class="flex items-center gap-1">{#if isRefiltering}<span class="loading loading-spinner loading-xs"></span>{:else}⚠️{/if} Missing</span>
                <span class="badge badge-sm badge-outline bg-base-100/50 border-gray-300/50">{missing.length}</span>
            </button>
            {#if scopeType === 'container'}
                <button type="button" class="btn btn-sm h-auto py-2 flex-1 min-w-[130px] rounded-xl border-none transition-all flex flex-wrap items-center justify-center gap-1 {activeTab === 'elsewhere' ? 'bg-base-100 shadow-sm text-warning font-bold' : 'btn-ghost text-gray-500 font-medium hover:bg-base-300/50'}" on:click={() => activeTab = 'elsewhere'}>
                    <span>📦 Elsewhere</span>
                    <span class="badge badge-sm badge-outline bg-base-100/50 border-gray-300/50">{groupedElsewhere.length}</span>
                </button>
            {/if}

        {/if}
        <button type="button" class="btn btn-sm h-auto py-2 flex-1 min-w-[130px] rounded-xl border-none transition-all flex flex-wrap items-center justify-center gap-1 {activeTab === 'unregistered' ? 'bg-base-100 shadow-sm text-primary font-bold' : 'btn-ghost text-gray-500 font-medium hover:bg-base-300/50'}" on:click={() => activeTab = 'unregistered'}>
            <span>✨ New</span>
            <span class="badge badge-sm badge-outline bg-base-100/50 border-gray-300/50">{groupedUnregistered.length}</span>
        </button>
        <button type="button" class="btn btn-sm h-auto py-2 flex-1 min-w-[130px] rounded-xl border-none transition-all flex flex-wrap items-center justify-center gap-1 {activeTab === 'correct' ? 'bg-base-100 shadow-sm text-success font-bold' : 'btn-ghost text-gray-500 font-medium hover:bg-base-300/50'}" on:click={() => activeTab = 'correct'}>
            <span>✓ 
                {#if scopeType === 'all'}Owned
                {:else if scopeType === 'container'}In Place
                {:else}In Stock{/if}
            </span>
            <span class="badge badge-sm badge-outline bg-base-100/50 border-gray-300/50">{groupedCorrect.length}</span>
        </button>
    </div>

    {#if activeTab === 'missing'}
        <div class="form-control bg-base-200/50 p-3 rounded-2xl border border-base-200 mb-2">
            <label class="label cursor-pointer py-0">
                <span class="label-text flex flex-col">
                    <span class="font-bold text-sm">Strict Quantity Audit</span>
                    <span class="text-xs text-gray-500">Show exact missing counts (including duplicates)</span>
                </span>
                <input type="checkbox" class="toggle toggle-primary" bind:checked={strictAuditMode} />
            </label>
        </div>

        {#if missing.length === 0} <CompareEmptyState type="missing" /> {:else}
            <div class="flex flex-col gap-2.5">
                {#each missing as item}
                    <div id="card-{item.title.replace(/\s+/g, '-')}" class="scroll-mt-24">
                        <CompareItemCard {item} type="missing" draftPath={results.draftPath}>
                            <div slot="actions">
                                <a href="/{item.id}/{item.slug || 'view'}" class="btn btn-ghost btn-xs text-error">View</a>
                            </div>
                        </CompareItemCard>
                    </div>
                {/each}
            </div>
        {/if}
    {:else if activeTab === 'unregistered'}
        {#if groupedUnregistered.length === 0} <CompareEmptyState type="unregistered" /> {:else}
            <div class="flex flex-col gap-2.5">
                {#each groupedUnregistered as item}
                    <div id="card-{item.title.replace(/\s+/g, '-')}" class="scroll-mt-24">
                        <CompareItemCard {item} type="unregistered" draftPath={results.draftPath} 
                            on:zoom={() => lightbox.open({ orgPath: results.draftPath, thumbPath: results.draftPath, showOriginal: true, box: item.box })}
                            on:discard={(e) => results.newToYou = results.newToYou.filter(i => i.title !== e.detail.title)}
                            on:link={(e) => { mergeSourceItem = e.detail; mergeModal.showModal(); }}
                        >
                            <div slot="actions">
                                <button type="button" class="btn btn-sm btn-primary rounded-xl shadow-sm shrink-0 gap-1 {savingTitles.has(item.title) ? 'btn-disabled' : ''}" on:click={() => { actionItem = item; actionModal.showModal(); }}>
                                    {#if savingTitles.has(item.title)}<span class="loading loading-spinner loading-xs"></span>
                                    {:else}<i class="bi bi-plus-lg"></i> Add{/if}
                                </button>
                            </div>
                        </CompareItemCard>
                    </div>
                {/each}
            </div>
        {/if}
    {:else if activeTab === 'elsewhere'}
        {#if groupedElsewhere.length === 0} <CompareEmptyState type="elsewhere" /> {:else}
            <div class="flex flex-col gap-2.5">
                {#each groupedElsewhere as item}
                    <div id="card-{item.title.replace(/\s+/g, '-')}" class="scroll-mt-24">
                        <CompareItemCard {item} type="elsewhere" draftPath={results.draftPath} on:zoom={() => lightbox.open({ orgPath: results.draftPath, thumbPath: results.draftPath, showOriginal: true, box: item.box })}>
                            <div slot="actions">
                                <a href="/{item.matchedItem.id}/{item.matchedItem.slug || 'view'}" class="btn btn-ghost btn-xs text-warning">View</a>
                            </div>
                        </CompareItemCard>
                    </div>
                {/each}
            </div>
        {/if}
    {:else if activeTab === 'correct'}
        {#if groupedCorrect.length === 0} <CompareEmptyState type="correct" /> {:else}
            <div class="flex flex-col gap-2.5">
                {#each groupedCorrect as item}
                    <div id="card-{item.title.replace(/\s+/g, '-')}" class="scroll-mt-24">
                        <CompareItemCard {item} type="correct" draftPath={results.draftPath} on:zoom={() => lightbox.open({ orgPath: results.draftPath, thumbPath: results.draftPath, showOriginal: true, box: item.box })}>
                            <div slot="actions">
                                <a href="/{item.matchedItem.id}/{item.matchedItem.slug || 'view'}" class="btn btn-circle btn-ghost btn-sm text-gray-400 hover:text-primary"><i class="bi bi-arrow-right-short text-2xl"></i></a>
                            </div>
                        </CompareItemCard>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}

    <!-- Sticky Contextual Footer for Bulk Actions -->
    {#if activeTab === 'missing' && missing.length > 0}
        <div class="fixed bottom-0 inset-x-0 p-4 bg-base-100/90 backdrop-blur-xl border-t border-base-200 z-50 flex justify-center pb-8 animate-fade-in gap-3">
            <button class="btn btn-error shadow-lg w-full max-w-sm rounded-xl" on:click={async () => {
                for(let m of missing) await quickAdd({title: m.title, subtitle: m.locationName ? `Was in ${m.locationName}` : ''}, 'to buy');
                results.missingFromScope = [];
                dispatch('notify', { status: 'success', message: 'Added missing items to Shopping List!' });
            }}>
                <i class="bi bi-cart-plus text-lg"></i> Add {missing.length} Missing to List
            </button>
        </div>
    {/if}

    {#if activeTab === 'unregistered' && unregistered.length > 0}
        <div class="fixed bottom-0 inset-x-0 p-4 bg-base-100/90 backdrop-blur-xl border-t border-base-200 z-50 flex justify-center pb-8 animate-fade-in gap-3">
            <button class="btn btn-primary shadow-lg flex-1 max-w-sm rounded-xl" on:click={async () => {
                for(let u of unregistered) await quickAdd(u, 'inventory');
                results.newToYou = [];
                dispatch('notify', { status: 'success', message: `Added ${unregistered.length} items to Inventory!` });
            }}>
                <i class="bi bi-box-seam"></i> Add {unregistered.length} to Inventory
            </button>
        </div>
    {/if}

    {#if activeTab === 'elsewhere' && elsewhere.length > 0 && scopeType === 'container'}
        <div class="fixed bottom-0 inset-x-0 p-4 bg-base-100/90 backdrop-blur-xl border-t border-base-200 z-50 flex justify-center pb-8 animate-fade-in gap-3">
            <button class="btn btn-warning shadow-lg flex-1 max-w-sm rounded-xl" on:click={async () => {
                for(let e of elsewhere) await quickMove(e.matchedItem.id, scopeValue);
                // Update local state instantly to reflect the move
                results.inCollection = results.inCollection.map(i => elsewhere.includes(i) ? {...i, matchedItem: {...i.matchedItem, locationName: scopeValue}} : i);
                dispatch('notify', { status: 'success', message: `Moved ${elsewhere.length} items to ${scopeValue}!` });
            }}>
                <i class="bi bi-arrows-move"></i> Move All to {scopeValue}
            </button>
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

<!-- Target Scope Bottom Sheet -->
<dialog bind:this={filterModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
   <div class="modal-box p-0 overflow-hidden bg-base-100 shadow-2xl border border-base-200 flex flex-col max-h-[85vh] sm:rounded-[2.5rem]">
       <div class="p-6 pb-4 border-b border-base-200 bg-base-100/90 sticky top-0 z-10 flex justify-between items-center">
           <div>
               <h3 class="font-bold text-lg leading-tight">Narrow down the comparison</h3>
               <p class="text-xs text-gray-500 mt-1">Select a specific category, tag, or box to see what's missing from it.</p>
           </div>
           <button class="btn btn-sm btn-circle btn-ghost" on:click={() => filterModal.close()}><i class="bi bi-x-lg"></i></button>
       </div>
       
       <div class="overflow-y-auto p-4 flex flex-col gap-6">
           <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-start items-center rounded-2xl {scopeType === 'all' ? 'border-primary bg-primary/5' : 'border-base-300'}" on:click={() => updateScope('all', '')}>
               <i class="bi bi-infinity text-2xl mr-3 {scopeType === 'all' ? 'text-primary' : 'text-gray-400'}"></i>
               <div class="text-left"><div class="font-bold">Entire Library</div><div class="text-xs text-gray-500 font-normal">Check for any new, unowned items</div></div>
           </button>

           {#if categories.length > 0}
               <div>
                   <div class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 px-1"><i class="bi bi-tags-fill mr-1"></i> By Category</div>
                   <div class="flex flex-wrap gap-2">
                       {#each categories as c}
                           <button class="badge badge-lg py-4 px-4 hover:border-primary transition-all capitalize {scopeType === 'category' && scopeValue === c.name ? 'badge-primary shadow-md' : 'badge-ghost border-base-300'}" on:click={() => updateScope('category', c.name)}>{c.name}</button>
                       {/each}
                   </div>
               </div>
           {/if}

           {#if containers.length > 0}
               <div>
                   <div class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 px-1"><i class="bi bi-box-seam-fill mr-1"></i> By Location</div>
                   <div class="flex flex-wrap gap-2">
                       {#each containers as c}
                           <button class="badge badge-lg py-4 px-4 hover:border-primary transition-all {scopeType === 'container' && scopeValue === c.name ? 'badge-primary shadow-md' : 'badge-ghost border-base-300'}" on:click={() => updateScope('container', c.name)}>{c.name}</button>
                       {/each}
                   </div>
               </div>
           {/if}

           {#if tags.length > 0}
               <div>
                   <div class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 px-1"><i class="bi bi-hash mr-1"></i> By Tag</div>
                   <div class="flex flex-wrap gap-2">
                       {#each tags as t}
                           <button class="badge badge-lg py-4 px-4 hover:border-primary transition-all {scopeType === 'tag' && scopeValue === t.slug ? 'badge-primary shadow-md' : 'badge-ghost border-base-300'}" on:click={() => updateScope('tag', t.slug)}>{t.name}</button>
                       {/each}
                   </div>
               </div>
           {/if}
       </div>
   </div>
   <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- Action Picker Bottom Sheet -->
<dialog bind:this={actionModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm" on:close={() => actionItem = null}>
    <div class="modal-box p-0 overflow-hidden bg-base-100 shadow-2xl border border-base-200 flex flex-col max-h-[85vh] sm:rounded-[2.5rem]">
        <div class="p-6 pb-4 border-b border-base-200 bg-base-100/90 sticky top-0 z-10 flex justify-between items-center">
            <div>
                <h3 class="font-bold text-lg leading-tight">Add to...</h3>
                <p class="text-xs text-gray-500 mt-1 truncate">Where should "{actionItem?.title}" go?</p>
            </div>
            <button class="btn btn-sm btn-circle btn-ghost shrink-0" on:click={() => actionModal.close()}><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="p-4 flex flex-col gap-3 bg-base-100">
            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-start items-center rounded-2xl border-base-300 hover:border-primary hover:bg-primary/5" on:click={() => { actionModal.close(); quickAdd(actionItem, 'inventory'); }}>
                <i class="bi bi-box-seam text-2xl mr-4 text-primary"></i>
                <div class="text-left"><div class="font-bold">Inventory</div><div class="text-xs text-gray-500 font-normal">Add to your database</div></div>
            </button>
            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-start items-center rounded-2xl border-base-300 hover:border-warning hover:bg-warning/5" on:click={() => { actionModal.close(); quickAdd(actionItem, 'to buy'); }}>
                <i class="bi bi-cart text-2xl mr-4 text-warning"></i>
                <div class="text-left"><div class="font-bold">Shopping List</div><div class="text-xs text-gray-500 font-normal">Add to your buy list</div></div>
            </button>
            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-start items-center rounded-2xl border-base-300 hover:border-success hover:bg-success/5" on:click={() => { actionModal.close(); quickAdd(actionItem, 'todo'); }}>
                <i class="bi bi-list-check text-2xl mr-4 text-success"></i>
                <div class="text-left"><div class="font-bold">To-Do List</div><div class="text-xs text-gray-500 font-normal">Add as a task</div></div>
            </button>
            {#if missing.length > 0}
                <div class="divider my-0 text-xs text-gray-400">OR</div>
                <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-start items-center rounded-2xl border-base-300 hover:border-info hover:bg-info/5 text-info" on:click={() => { actionModal.close(); mergeSourceItem = actionItem; mergeModal.showModal(); }}>
                    <i class="bi bi-link-45deg text-2xl mr-4"></i>
                    <div class="text-left"><div class="font-bold">Link to Existing...</div><div class="text-xs text-info/70 font-normal">Match it to an expected item</div></div>
                </button>
            {/if}
        </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
