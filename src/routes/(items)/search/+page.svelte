<script lang="ts">
    import type { PageServerData } from "./$types";
    import Navigation from "$lib/components/navigation.svelte";
    import Items from "$lib/components/items.svelte";
    import Search from "$lib/components/search.svelte";
    import { enhance } from "$app/forms";
    import InteractiveColorMix from "$lib/components/InteractiveColorMix.svelte";

    export let data: PageServerData;


	let bulkMode = false;
	let selectedIds: number[] = [];
	let bulkAction = 'addTag';
	let bulkValue = '';
	let isSubmitting = false;
	let navLoadedPages: any[] = [];
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
			unassigned: data.unassigned ? 'true' : ''
		}).filter(([_, v]) => v) 
	).toString();

    import pageTitle from '$lib/stores';
	$: pageTitle.set(data.cat ? "Category: " + data.cat : (data.q ? "Search for " + data.q : "Search"));
</script>

<div class="flex justify-between items-center mb-6 px-2">
	<h1 class="text-2xl font-bold tracking-tight flex items-center gap-3">
		Results <span class="text-sm text-gray-500 font-medium bg-base-200 px-3 py-1 rounded-full">{data.totalCount} found</span>
	</h1>
	<button class="btn btn-outline btn-sm shadow-sm rounded-xl border-base-300" on:click={() => { bulkMode = !bulkMode; selectedIds = []; }}>
		{#if bulkMode}
			Cancel Bulk
		{:else}
			<i class="bi bi-ui-checks-grid"></i> Bulk Edit
		{/if}
	</button>
</div>

<!-- Filters -->
<details class="collapse collapse-arrow bg-base-100 mb-6 border border-base-200 shadow-sm rounded-xl">
	<summary class="collapse-title text-sm font-semibold text-gray-600 px-4 min-h-0 h-auto py-3">Filters</summary>
	<div class="collapse-content px-4 pb-4 flex flex-col gap-3 border-t border-base-100 pt-3 bg-base-50/50">
		<form method="GET" action="/search" class="flex flex-col gap-3">
			<input type="hidden" name="q" value={data.q}>
			
			<div class="flex gap-4 flex-col sm:flex-row">
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Has Tag</span>
					<input type="text" name="tag" value={data.tag || ''} class="input input-sm input-bordered rounded-lg" placeholder="e.g. electronics" />
				</div>
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">In Container</span>
					<input type="text" name="container" value={data.container || ''} class="input input-sm input-bordered rounded-lg" placeholder="e.g. A 001" />
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Category</span>
					<select name="category" class="select select-sm select-bordered rounded-lg font-normal capitalize">
						<option value="">Any Category</option>
                        <option value="_uncategorized" selected={data.cat === '_uncategorized'}>Uncategorized</option>
						{#each data.categories as c}
							<option value={c.name} selected={data.cat === c.name} class="capitalize">{c.name}</option>
						{/each}
					</select>
				</div>
				<div class="form-control w-full">
					<span class="label-text text-xs font-semibold mb-1 uppercase tracking-wider">Title</span>
					<input type="text" name="title" value={data.titleStr || ''} class="input input-sm input-bordered rounded-lg" placeholder="Exact name match..." />
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
            <div class="flex flex-col sm:flex-row gap-4 mt-2">
                <label class="flex items-center gap-2 cursor-pointer mt-1">
                    <input type="checkbox" name="unassigned" value="true" class="checkbox checkbox-sm checkbox-primary" checked={data.unassigned} />
                    <span class="text-sm font-medium">Unassigned only</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer mt-1">
                    <input type="checkbox" name="duplicateStatus" value="FLAGGED" class="checkbox checkbox-sm checkbox-warning" checked={data.duplicateStatus === 'FLAGGED'} />
                    <span class="text-sm font-medium">Flagged Duplicates only</span>
                </label>
            </div>
			<button type="submit" class="btn btn-sm btn-primary mt-2 w-max shadow-sm rounded-lg">Apply Filters</button>
		</form>
	</div>
</details>

{#if bulkMode}
	<form method="POST" action="?/bulkEdit" class="pb-32" use:enhance={() => {
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
                    <button type="submit" class="btn btn-primary w-full sm:w-auto shadow-md shrink-0" disabled={isSubmitting || (!bulkValue.trim() && bulkAction !== 'flagDuplicate' && bulkAction !== 'dismissDuplicate' && bulkAction !== 'clearDuplicate')}>
						{#if isSubmitting}<span class="loading loading-spinner"></span>{:else}Apply to {selectedIds.length}{/if}
					</button>
				</div>
			</div>
		{/if}
	</form>
{:else}
	<Items items={data.items} />
	<Navigation href="/search?{searchParamsStr}&" prevPage={data.prevPage} nextPage={data.nextPage} />
{/if}

