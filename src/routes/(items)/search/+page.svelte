<script lang="ts">
    import { page } from '$app/stores';
    import type { PageServerData } from "./$types";
    import Navigation from "$lib/components/navigation.svelte";
    import Items from "$lib/components/items.svelte";
    import Search from "$lib/components/search.svelte";
    import { enhance } from "$app/forms";
    import InteractiveColorMix from "$lib/components/InteractiveColorMix.svelte";
    import BottomSheet from "$lib/components/BottomSheet.svelte";
    import CompareAttributeSheet from "$lib/components/compare/CompareAttributeSheet.svelte";
    import DocumentList from "$lib/components/search/DocumentList.svelte";
    import DocumentLightbox from "$lib/components/DocumentLightbox.svelte";
    import ImageLightbox from "$lib/components/ImageLightbox.svelte";

    export let data: PageServerData;


	let bulkMode = false;
	let selectedIds: number[] = [];
	let bulkAction = 'addTag';
	let bulkValue = '';
	let isSubmitting = false;
    let bulkDeleteModal: HTMLDialogElement;
    let exportCsvModal: HTMLDialogElement;
    let exportConfig = { core: true, locs: true, attrs: true, tags: true, images: false };
    let isExporting = false;

	let navLoadedPages: any[] = [];
    let filterModal: BottomSheet;
    let filterAttrs: Record<string, string> = {};
    let selectedCategory = data.cat || '';
    let filterForm: HTMLFormElement;
    let docLightbox: DocumentLightbox;
    let imgLightbox: ImageLightbox;

    // Hydrate tab state from session memory safely
    let searchTab: 'items' | 'documents' = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('itemlens_search_tab')) as any || 'items';
    $: if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('itemlens_search_tab', searchTab);

    // Toggle: Set to true to drop the attribute key and show only the friendly value in pills
    const COMPACT_PILLS = true;

	$: allLoadedItems = [...data.items, ...(navLoadedPages || []).flat()];

   let isAllSelectedGlobally = false;
	// Check if EVERY visible item on the screen is currently in the selected list
	$: isAllSelected = allLoadedItems.length > 0 && allLoadedItems.every(item => selectedIds.includes(item.id));

   // Auto-select new items if we are in "select all" mode
   $: if (isAllSelectedGlobally && allLoadedItems.length > 0) {
       const newIds = new Set(selectedIds);
       let added = false;
       allLoadedItems.forEach(item => {
           if (!newIds.has(item.id)) { newIds.add(item.id); added = true; }
       });
       if (added) selectedIds = Array.from(newIds);
   }

	$: {
		console.log('[DEBUG-BULK] State Update ->', {
			dataItems: data.items.length, 
			navPages: navLoadedPages.length, 
			allLoaded: allLoadedItems.length, 
			selected: selectedIds.length, 
			isAllSelected
		});
	}

	// Helper for slot-safe checkbox binding
	function toggleSelection(id, checked) {
		console.log(`[DEBUG-BULK] Toggling item ${id} to ${checked}`);
		if (checked) {
			if (!selectedIds.includes(id)) selectedIds = [...selectedIds, id];
		}
       else {
           selectedIds = selectedIds.filter(x => x !== id);
           isAllSelectedGlobally = false;
       }
	}

	function toggleAll(checked) {
		console.log(`[DEBUG-BULK] Toggling ALL visible items to ${checked}`);
		if (checked) {
           isAllSelectedGlobally = true;
			const newIds = new Set(selectedIds);
			allLoadedItems.forEach(item => newIds.add(item.id));
			selectedIds = Array.from(newIds);
		} else {
           isAllSelectedGlobally = false;
			const visibleIds = new Set(allLoadedItems.map(i => i.id));
			selectedIds = selectedIds.filter(id => !visibleIds.has(id));
		}
	}

	// Cleanly build the query string for pagination, omitting blanks
	$: searchParamsStr = new URLSearchParams(
		Object.entries({
			q: data.q, category: data.cat, tag: data.tag, container: data.container,
            title: data.titleStr, desc: data.descStr, doc: data.docStr, reason: data.reasonStr, duplicateStatus: data.duplicateStatus, color: data.color,
			minAmount: data.minAmount, maxAmount: data.maxAmount,
            unassigned: data.unassigned ? 'true' : '',
            attrs: $page.url.searchParams.get('attrs') || ''
		}).filter(([_, v]) => v) 
	).toString();

    // Sync filterAttrs from URL reactively (handles back button and Clear All)
    let lastUrlAttrs = '__init__';
    $: {
        try {
            const currentUrlAttrs = $page.url.searchParams.get('attrs') || '';
            if (currentUrlAttrs !== lastUrlAttrs) {
                lastUrlAttrs = currentUrlAttrs;
                filterAttrs = currentUrlAttrs ? JSON.parse(currentUrlAttrs) : {};
            }
        } catch(e) { filterAttrs = {}; }
    }

    function removeFilter(type: string, key?: string) {
        if (type === 'attrs' && key) {
            delete filterAttrs[key];
            filterAttrs = filterAttrs; // trigger reactivity
        } else if (type === 'tag') {
            const el = filterForm.elements.namedItem('tag') as HTMLSelectElement;
            if (el) el.value = '';
        } else if (type === 'container') {
            const el = filterForm.elements.namedItem('container') as HTMLSelectElement;
            if (el) el.value = '';
        } else if (type === 'category') {
            selectedCategory = '';
        } else if (type === 'unassigned') {
            const el = filterForm.elements.namedItem('unassigned') as HTMLInputElement;
            if (el) el.checked = false;
        }
        setTimeout(() => filterForm.requestSubmit(), 0);
    }

    async function downloadCSV() {
        isExporting = true;
        try {
            const res = await fetch('/api/export-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemIds: selectedIds, config: exportConfig })
            });
            if (!res.ok) throw new Error('Export failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = res.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1] || 'export.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            
            exportCsvModal.close();
        } catch (e) {
            alert('Failed to export CSV.');
        } finally {
            isExporting = false;
        }
    }

    // Dynamically filter and deduplicate attributes based on the selected category
    $: dynamicSchema = (() => {
        let fields = data.activeSchema || [];
        if (selectedCategory && selectedCategory !== '_uncategorized') {
            const lowerCat = selectedCategory.toLowerCase();
            fields = fields.filter(f => f.categoryId === null || (f.categoryName || '').toLowerCase() === lowerCat);
        }
        
        // Deduplicate keys (e.g. if 'fabric' exists in 5 categories, merge into one dropdown with all unique options)
        const merged = new Map();
        for (const f of fields) {
            if (!merged.has(f.name)) {
                merged.set(f.name, { ...f, options: f.options ? [...f.options] : null });
            } else {
                const existing = merged.get(f.name);
                if (f.options && existing.options) {
                    existing.options = [...new Set([...existing.options, ...f.options])];
                }
            }
        }
        return Array.from(merged.values());
    })();

    import pageTitle from '$lib/stores';
	$: pageTitle.set(data.cat ? "Category: " + data.cat : (data.q ? "Search for " + data.q : "Search"));
</script>

<div class="flex justify-between items-center mb-6 px-2">
	<h1 class="text-2xl font-bold tracking-tight flex items-center gap-3">
		Results <span class="text-sm text-gray-500 font-medium bg-base-200 px-3 py-1 rounded-full">{data.totalCount} found</span>
	</h1>
    <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm bg-base-200/50 hover:bg-base-300 shadow-sm rounded-xl border border-base-300" on:click={() => filterModal.showModal()}>
            <i class="bi bi-funnel"></i> Filters
        </button>
        <button class="btn btn-outline btn-sm shadow-sm rounded-xl border-base-300" on:click={() => { bulkMode = !bulkMode; selectedIds = []; searchTab = 'items'; }}>
            {#if bulkMode}Cancel Bulk Edit{:else}<i class="bi bi-ui-checks-grid"></i> Bulk Edit{/if}
        </button>
    </div>
</div>

<!-- Active Filter Chips -->
{#if data.tag || data.container || data.cat || data.unassigned || Object.keys(filterAttrs).length > 0}
<div class="flex flex-wrap gap-2 px-2 mb-6">
    {#if data.tag}<button class="badge badge-primary gap-1 p-3 font-semibold shadow-sm" on:click={() => removeFilter('tag')}><i class="bi bi-hash"></i> {data.tag} <i class="bi bi-x ml-1"></i></button>{/if}
    {#if data.container}<button class="badge badge-primary gap-1 p-3 font-semibold shadow-sm" on:click={() => removeFilter('container')}><i class="bi bi-box-seam"></i> {data.container} <i class="bi bi-x ml-1"></i></button>{/if}
    {#if data.cat}<button class="badge badge-primary gap-1 p-3 font-semibold shadow-sm capitalize" on:click={() => removeFilter('category')}><i class="bi bi-tags"></i> {data.cat} <i class="bi bi-x ml-1"></i></button>{/if}
    {#if data.unassigned}<button class="badge badge-primary gap-1 p-3 font-semibold shadow-sm" on:click={() => removeFilter('unassigned')}><i class="bi bi-pin-map"></i> Unassigned <i class="bi bi-x ml-1"></i></button>{/if}
    {#each Object.entries(filterAttrs) as [k,v]}
        {@const schemaField = (data.activeSchema || []).find(f => f.name === k)}
        {@const friendlyKey = schemaField?.uiLabel || k.replace(/_/g, ' ')}
        <button class="badge badge-secondary gap-1 p-3 font-semibold shadow-sm capitalize" on:click={() => removeFilter('attrs', k)}>{COMPACT_PILLS ? v : `${friendlyKey}: ${v}`} <i class="bi bi-x ml-1"></i></button>
    {/each}
    <button class="btn btn-xs btn-ghost text-gray-400" on:click={() => { window.location.href = '/search'; }}>Clear All</button>
</div>
{/if}

{#if !bulkMode}
<div class="bg-base-200 p-1 rounded-2xl flex w-full max-w-md mx-auto mb-6 mt-2 relative z-10 border border-base-300 shadow-inner">
    <button type="button" class="flex-1 btn btn-sm border-none {searchTab === 'items' ? 'bg-base-100 shadow-sm hover:bg-base-100 text-base-content' : 'btn-ghost text-gray-500 hover:text-base-content hover:bg-base-300'}" on:click={() => searchTab = 'items'}>
        Items <span class="badge badge-sm badge-ghost ml-1">{data.totalCount}</span>
    </button>
    <button type="button" class="flex-1 btn btn-sm border-none {searchTab === 'documents' ? 'bg-base-100 shadow-sm hover:bg-base-100 text-base-content' : 'btn-ghost text-gray-500 hover:text-base-content hover:bg-base-300'}" on:click={() => searchTab = 'documents'}>
        Documents <span class="badge badge-sm badge-ghost ml-1">{data.documentResults.length}</span>
    </button>
</div>
{/if}

	<BottomSheet bind:this={filterModal} title="Search Filters">
        <form bind:this={filterForm} method="GET" action="/search" class="flex flex-col gap-3" on:submit={() => filterModal.close()}>
            <input type="hidden" name="attrs" value={JSON.stringify(filterAttrs)}>
			
			<div class="flex gap-4 flex-col sm:flex-row">
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Has Tag</span>
                    <select name="tag" class="select select-sm select-bordered rounded-lg font-normal">
                        <option value="">Any Tag</option>
                        {#each (data.tags || []) as t}
                            <option value={t.slug} selected={data.tag === t.slug}>{t.name}</option>
                        {/each}
                    </select>
				</div>
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">In Container</span>
                    <select name="container" class="select select-sm select-bordered rounded-lg font-normal">
                        <option value="">Any Container</option>
                        {#each (data.containers || []) as c}
                            <option value={c.name} selected={data.container === c.name}>{c.name}</option>
                        {/each}
                    </select>
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Category</span>
                    <select name="category" bind:value={selectedCategory} class="select select-sm select-bordered rounded-lg font-normal capitalize">
						<option value="">Any Category</option>
                        <option value="_uncategorized">Uncategorized</option>
						{#each data.categories as c}
                            <option value={c.name} class="capitalize">{c.name}</option>
						{/each}
					</select>
				</div>
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Title</span>
                    <input type="text" name="title" value={data.titleStr || ''} class="input input-sm input-bordered rounded-lg" placeholder="e.g. raspberry or Aerosmith..." />
				</div>
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Description</span>
					<input type="text" name="desc" value={data.descStr || ''} class="input input-sm input-bordered rounded-lg" placeholder="Description content..." />
				</div>
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Document Contains</span>
					<input type="text" name="doc" value={data.docStr || ''} class="input input-sm input-bordered rounded-lg" placeholder="Search manuals, notes, extracts..." />
				</div>
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Reason</span>
					<input type="text" name="reason" value={data.reasonStr || ''} class="input input-sm input-bordered rounded-lg" placeholder="e.g. Curiosity" />
				</div>
				<div class="form-control w-full flex flex-row gap-2 items-end">
					<div class="w-1/2">
						<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider block">Min Qty</span>
						<input type="number" name="minAmount" value={data.minAmount || ''} class="input input-sm input-bordered rounded-lg w-full" placeholder="0" />
					</div>
					<div class="w-1/2">
						<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider block">Max Qty</span>
						<input type="number" name="maxAmount" value={data.maxAmount || ''} class="input input-sm input-bordered rounded-lg w-full" placeholder="10" />
					</div>
				</div>

                <div class="form-control w-full sm:col-span-2 overflow-x-auto pb-2">
                    <span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Color Mix</span>
                    <InteractiveColorMix initialMixStr={data.color} bind:valueStr={data.color} />
                    <input type="hidden" name="color" value={data.color} />
                </div>
			</div>

            <div class="divider my-1">Attributes</div>
            <CompareAttributeSheet 
                mode="filter" 
                bind:localAttributes={filterAttrs} 
                activeSchema={dynamicSchema} 
                attributeCounts={data.attributeCounts}
                on:change={(e) => filterAttrs = e.detail} 
            />
            <div class="flex flex-col sm:flex-row gap-4 mt-2">
                <label class="flex items-center gap-2 cursor-pointer mt-1">
                    <input type="checkbox" name="unassigned" value="true" class="checkbox checkbox-sm checkbox-primary" checked={data.unassigned} />
                    <span class="text-sm font-medium">No location assigned</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer mt-1">
                    <input type="checkbox" name="duplicateStatus" value="FLAGGED" class="checkbox checkbox-sm checkbox-warning" checked={data.duplicateStatus === 'FLAGGED'} />
                    <span class="text-sm font-medium">Flagged Duplicates only</span>
                </label>
            </div>
            <div class="sticky bottom-0 bg-base-100 p-2 mt-4 border-t border-base-200">
                <button type="submit" class="btn btn-primary w-full shadow-sm rounded-xl">Apply Filters</button>
            </div>
		</form>
	</BottomSheet>

{#if bulkMode}
    <form id="bulkEditForm" method="POST" action="?/bulkEdit" class="pb-32" use:enhance={() => {
		isSubmitting = true;
		return async ({ update }) => {
			await update();
			isSubmitting = false;
			bulkMode = false;
			selectedIds = [];
		};
	}}>
		<!-- Master Checkbox Bar -->
		<div class="flex items-center justify-between bg-base-200/50 p-3 rounded-xl border border-base-200 shadow-inner mb-3">
			<label class="flex items-center gap-3 cursor-pointer">
				<input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked={isAllSelected} on:change={(e) => toggleAll(e.currentTarget.checked)} />
				<span class="text-sm font-bold text-gray-500 uppercase tracking-wider">Select All Loaded</span>
			</label>
			<span class="text-xs font-bold bg-base-100 px-2 py-1 rounded-md shadow-sm text-gray-500">{selectedIds.length} selected</span>
		</div>

		<div class="flex flex-col gap-2">
			{#each data.items as item}
				<label class="flex items-center gap-4 p-3 bg-base-100 border border-base-200 shadow-sm rounded-xl cursor-pointer hover:border-primary transition-colors">
					<input type="checkbox" class="checkbox checkbox-primary" name="itemIds[]" value={item.id} checked={selectedIds.includes(item.id)} on:change={(e) => toggleSelection(item.id, e.currentTarget.checked)}>
					<div class="w-12 h-12 rounded-lg bg-base-200 overflow-hidden shrink-0">
						{#if item.photos?.[0]?.thumbPath}
							<img src={item.photos[0].thumbPath} alt={item.title} class="w-full h-full object-cover">
						{:else}
							<div class="w-full h-full flex items-center justify-center"><i class="bi bi-box text-xl text-gray-400"></i></div>
						{/if}
					</div>
					<div class="flex flex-col min-w-0 flex-1">
						<span class="font-bold text-base-content truncate">{item.title}</span>
						<span class="text-xs text-gray-500 line-clamp-1">{item.description || 'No description'}</span>
					</div>
				</label>
			{/each}
		</div>

		<Navigation href="/search?{searchParamsStr}&" prevPage={data.prevPage} nextPage={data.nextPage} on:pagesUpdated={(e) => navLoadedPages = e.detail} let:items={pageItems}>
			<div class="flex flex-col gap-2 mt-2">
				{#each pageItems as item}
					<label class="flex items-center gap-4 p-3 bg-base-100 border border-base-200 shadow-sm rounded-xl cursor-pointer hover:border-primary transition-colors">
						<input type="checkbox" class="checkbox checkbox-primary" name="itemIds[]" value={item.id} checked={selectedIds.includes(item.id)} on:change={(e) => toggleSelection(item.id, e.currentTarget.checked)}>
						<div class="w-12 h-12 rounded-lg bg-base-200 overflow-hidden shrink-0">
							{#if item.photos?.[0]?.thumbPath}
								<img src={item.photos[0].thumbPath} alt={item.title} class="w-full h-full object-cover">
							{:else}
								<div class="w-full h-full flex items-center justify-center"><i class="bi bi-box text-xl text-gray-400"></i></div>
							{/if}
						</div>
						<div class="flex flex-col min-w-0 flex-1">
							<span class="font-bold text-base-content truncate">{item.title}</span>
							<span class="text-xs text-gray-500 line-clamp-1">{item.description || 'No description'}</span>
						</div>
					</label>
				{/each}
			</div>
		</Navigation>

		{#if selectedIds.length > 0}
            <div class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 w-full p-4 bg-base-100/95 backdrop-blur-xl border-t border-base-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-40 animate-fade-in">
				<div class="max-w-2xl mx-auto flex flex-col sm:flex-row items-end gap-3">
					<select name="bulkAction" bind:value={bulkAction} class="select select-bordered w-full sm:w-auto shrink-0 bg-base-200">
						<option value="addTag">Add Tag</option>
						<option value="removeTag">Remove Tag</option>
						<option value="addContainer">Add to Container</option>
						<option value="removeContainer">Remove Container</option>
						<option value="setCategory">Set Category</option>
                        <option value="flagDuplicate">Flag as Duplicate</option>
                        <option value="dismissDuplicate">Dismiss Duplicate</option>
                        <option value="clearDuplicate">Clear Duplicate Status</option>
                        <option value="deleteItems">Delete Items</option>
                        <option value="exportCSV">Export to CSV</option>
					</select>
                    {#if bulkAction === 'setCategory' && data.categories}
                        <select name="bulkValue" bind:value={bulkValue} required class="select select-bordered w-full flex-1 bg-base-200 capitalize">
                            <option value="" disabled selected>Select category...</option>
                            {#each data.categories as c} <option value={c.name}>{c.name}</option> {/each}
                        </select>
                    {:else if (bulkAction === 'addContainer' || bulkAction === 'removeContainer') && data.containers}
                        <select name="bulkValue" bind:value={bulkValue} required class="select select-bordered w-full flex-1 bg-base-200">
                            <option value="" disabled selected>Select container...</option>
                            {#each data.containers as c} <option value={c.name}>{c.name}</option> {/each}
                        </select>
                    {:else if bulkAction === 'removeTag'}
                        <select name="bulkValue" bind:value={bulkValue} required class="select select-bordered w-full flex-1 bg-base-200">
                            <option value="" disabled selected>Select tag...</option>
                            {#each data.tags as t} <option value={t.name}>{t.name}</option> {/each}
                        </select>
                    {:else if bulkAction === 'addTag'}
                        <input type="text" name="bulkValue" bind:value={bulkValue} placeholder="Value..." required class="input input-bordered w-full flex-1 bg-base-200" autocomplete="off" />
                    {:else}
                        <input type="hidden" name="bulkValue" value="action_only" />
                        <!--input type="text" name="bulkValue" bind:value={bulkValue} placeholder="Value..." required class="input input-bordered w-full flex-1 bg-base-200" autocomplete="off" /-->
                    {/if}
                    <button type="submit" class="btn {bulkAction === 'deleteItems' ? 'btn-error' : (bulkAction === 'exportCSV' ? 'btn-secondary' : 'btn-primary')} w-full sm:w-auto shadow-md shrink-0" 
                            disabled={isSubmitting || (!bulkValue.trim() && !['deleteItems', 'flagDuplicate', 'dismissDuplicate', 'clearDuplicate', 'exportCSV'].includes(bulkAction))}
                            on:click={(e) => {
                                if (bulkAction === 'deleteItems') {
                                    e.preventDefault();
                                    bulkDeleteModal.showModal();
                                } else if (bulkAction === 'exportCSV') {
                                    e.preventDefault();
                                    exportCsvModal.showModal();
                                }
                            }}>
                        {#if isSubmitting}<span class="loading loading-spinner"></span>{:else if bulkAction === 'exportCSV'}<i class="bi bi-download"></i> Export {selectedIds.length}{:else}Apply to {selectedIds.length}{/if}
					</button>
				</div>
			</div>
		{/if}
	</form>

    <dialog bind:this={bulkDeleteModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
        <div class="modal-box bg-base-100 border border-error/50 shadow-2xl">
            <h3 class="font-bold text-lg text-error flex items-center gap-2">
                <i class="bi bi-exclamation-triangle-fill"></i> Delete {selectedIds.length} Items?
            </h3>
            <p class="py-4 text-sm text-gray-600">You are about to permanently delete <strong>{selectedIds.length}</strong> items. This action cannot be undone and will destroy all associated photos, documents, and data.</p>
            <div class="modal-action">
                <button type="button" class="btn btn-ghost" on:click={() => bulkDeleteModal.close()}>Cancel</button>
                <button type="button" class="btn btn-error" on:click={() => { bulkDeleteModal.close(); document.getElementById('bulkEditForm')?.requestSubmit(); }}>Delete Forever</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>

    <dialog bind:this={exportCsvModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
        <div class="modal-box bg-base-100 border border-base-200 shadow-2xl p-6 sm:rounded-3xl">
            <h3 class="font-bold text-xl flex items-center gap-2 mb-2">
                <i class="bi bi-filetype-csv text-secondary"></i> Export to CSV
            </h3>
            <p class="text-sm text-gray-500 mb-6">Select what data to include in your spreadsheet for the {selectedIds.length} selected items.</p>
            
            <div class="flex flex-col gap-3 mb-6 bg-base-200/50 p-4 rounded-xl border border-base-200">
                <label class="flex justify-between items-center cursor-pointer hover:bg-base-200 p-1 rounded transition-colors"><span class="font-semibold text-sm text-base-content">Core Details <span class="font-normal text-xs text-gray-500 block">Title, Qty, Desc</span></span> <input type="checkbox" class="toggle toggle-primary" bind:checked={exportConfig.core} /></label>
                <label class="flex justify-between items-center cursor-pointer hover:bg-base-200 p-1 rounded transition-colors"><span class="font-semibold text-sm text-base-content">Storage Locations <span class="font-normal text-xs text-gray-500 block">Where it lives</span></span> <input type="checkbox" class="toggle toggle-primary" bind:checked={exportConfig.locs} /></label>
                <label class="flex justify-between items-center cursor-pointer hover:bg-base-200 p-1 rounded transition-colors"><span class="font-semibold text-sm text-base-content">AI Attributes & Traits <span class="font-normal text-xs text-gray-500 block">Dynamically creates columns per attribute</span></span> <input type="checkbox" class="toggle toggle-primary" bind:checked={exportConfig.attrs} /></label>
                <label class="flex justify-between items-center cursor-pointer hover:bg-base-200 p-1 rounded transition-colors"><span class="font-semibold text-sm text-base-content">Tags</span> <input type="checkbox" class="toggle toggle-primary" bind:checked={exportConfig.tags} /></label>
                <label class="flex justify-between items-center cursor-pointer hover:bg-base-200 p-1 rounded transition-colors"><span class="font-semibold text-sm text-base-content">Primary Image Link <span class="font-normal text-xs text-gray-500 block">Absolute server URL</span></span> <input type="checkbox" class="toggle toggle-primary" bind:checked={exportConfig.images} /></label>
            </div>

            <div class="modal-action mt-0 flex gap-2">
                <button type="button" class="btn btn-ghost flex-1 rounded-xl" on:click={() => exportCsvModal.close()} disabled={isExporting}>Cancel</button>
                <button type="button" class="btn btn-secondary flex-1 rounded-xl shadow-md" on:click={downloadCSV} disabled={isExporting}>
                    {#if isExporting}
                        <span class="loading loading-spinner loading-sm"></span> Generating...
                    {:else}
                        <i class="bi bi-download"></i> Download CSV
                    {/if}
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>
{:else if searchTab === 'documents'}
    <DocumentList documents={data.documentResults} on:openDoc={(e) => docLightbox.open(e.detail)} on:openImage={(e) => imgLightbox.open(e.detail)} />
{:else}
	<Items items={data.items} />
	<Navigation href="/search?{searchParamsStr}&" prevPage={data.prevPage} nextPage={data.nextPage} />
{/if}

<DocumentLightbox bind:this={docLightbox} />
<ImageLightbox bind:this={imgLightbox} itemTitle="Search Result" />
