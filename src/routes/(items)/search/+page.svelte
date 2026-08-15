<script lang="ts">
    import type { PageServerData } from "./$types";
    import Navigation from "$lib/components/navigation.svelte";
    import Items from "$lib/components/items.svelte";
    import Search from "$lib/components/search.svelte";
    import { enhance } from "$app/forms";

    export let data: PageServerData;


	let bulkMode = false;
	let selectedIds: number[] = [];
	let bulkAction = 'addTag';
	let bulkValue = '';
	let isSubmitting = false;

	// Helper for slot-safe checkbox binding
	function toggleSelection(id, checked) {
		if (checked) selectedIds = [...selectedIds, id];
		else selectedIds = selectedIds.filter(x => x !== id);
	}

    import pageTitle from '$lib/stores';
	$: pageTitle.set(data.cat ? "Category: " + data.cat : (data.q ? "Search for " + data.q : "Search"));
</script>

<div class="flex justify-between items-center mb-6 px-2">
	<h1 class="text-2xl font-bold tracking-tight">Results</h1>
	<button class="btn btn-outline btn-sm shadow-sm rounded-xl border-base-300" on:click={() => { bulkMode = !bulkMode; selectedIds = []; }}>
		{#if bulkMode}
			Cancel Bulk
		{:else}
			<i class="bi bi-ui-checks-grid"></i> Bulk Edit
		{/if}
	</button>
</div>

<!-- Advanced Filters -->
<details class="collapse collapse-arrow bg-base-100 mb-6 border border-base-200 shadow-sm rounded-xl">
	<summary class="collapse-title text-sm font-semibold text-gray-600 px-4 min-h-0 h-auto py-3">Advanced Filters</summary>
	<div class="collapse-content px-4 pb-4 flex flex-col gap-3 border-t border-base-100 pt-3 bg-base-50/50">
		<form method="GET" action="/search" class="flex flex-col gap-3">
			<input type="hidden" name="q" value={data.q}>
			{#if data.cat}<input type="hidden" name="category" value={data.cat}>{/if}
			
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
			<label class="flex items-center gap-2 cursor-pointer mt-1">
				<input type="checkbox" name="unassigned" value="true" class="checkbox checkbox-sm checkbox-primary" checked={data.unassigned} />
				<span class="text-sm font-medium">Unassigned items only (No location)</span>
			</label>
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
				<input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked={selectedIds.length > 0 && selectedIds.length >= data.items.length} on:change={(e) => {
					if (e.currentTarget.checked) {
						selectedIds = Array.from(document.querySelectorAll('input[name="itemIds[]"]')).map(el => Number((el as HTMLInputElement).value));
					} else {
						selectedIds = [];
					}
				}} />
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

		<Navigation href="/search?q={encodeURIComponent(data.q)}{data.cat ? `&category=${encodeURIComponent(data.cat)}` : ''}{data.tag ? `&tag=${encodeURIComponent(data.tag)}` : ''}{data.container ? `&container=${encodeURIComponent(data.container)}` : ''}{data.unassigned ? '&unassigned=true' : ''}&" prevPage={data.prevPage} nextPage={data.nextPage} let:items={pageItems}>
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
			<div class="fixed bottom-0 left-0 w-full p-4 bg-base-100/95 backdrop-blur-xl border-t border-base-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50 animate-fade-in">
				<div class="max-w-2xl mx-auto flex flex-col sm:flex-row items-end gap-3">
					<select name="bulkAction" bind:value={bulkAction} class="select select-bordered w-full sm:w-auto shrink-0 bg-base-200">
						<option value="addTag">Add Tag</option>
						<option value="removeTag">Remove Tag</option>
						<option value="addContainer">Add to Container</option>
						<option value="removeContainer">Remove Container</option>
						<option value="setCategory">Set Category</option>
					</select>
					<input type="text" name="bulkValue" bind:value={bulkValue} placeholder="Value..." required class="input input-bordered w-full flex-1 bg-base-200" autocomplete="off" />
					<button type="submit" class="btn btn-primary w-full sm:w-auto shadow-md shrink-0" disabled={isSubmitting || !bulkValue.trim()}>
						{#if isSubmitting}<span class="loading loading-spinner"></span>{:else}Apply to {selectedIds.length}{/if}
					</button>
				</div>
			</div>
		{/if}
	</form>
{:else}
	<Items items={data.items} />
	<Navigation href="/search?q={encodeURIComponent(data.q)}{data.cat ? `&category=${encodeURIComponent(data.cat)}` : ''}&" prevPage={data.prevPage} nextPage={data.nextPage} />
{/if}

