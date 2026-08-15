<script lang="ts">
    import { flip } from 'svelte/animate';
    import { goto } from '$app/navigation';
    import { createEventDispatcher } from 'svelte';
    import pageTitle from '$lib/stores';
    import ContainerSelector from "$lib/components/ContainerSelector.svelte";
    import ImageLightbox from "$lib/components/ImageLightbox.svelte";
    import ContentUnavailable from "$lib/components/ContentUnavailable.svelte";

    export let isDirty = false;
    export let containers = [];
    const dispatch = createEventDispatcher();
    
    let fileInputCamera: HTMLInputElement;
    let fileInputGallery: HTMLInputElement;
    let isUploading = false;
    let isUploadingMessage = "";
    let uploadError = "";

    let draftPath = "";
    let draftNoteId: number | null = null;
    let collectionType = "";
    let items: any[] = [];

    let selectedContainers: string[] = [];
    let globalCategory = "";
    let globalTags = "";
    let settingsExpanded = true;
	let collectionHint = "";
	let showHintInput = false;

    // Edit Modal State
    let editModal: HTMLDialogElement;
    let editingIndex = -1;
    let editTitle = "";
    let editSubtitle = "";
    let lightbox: ImageLightbox;

    pageTitle.set("Add Collection");

    async function handleFileSelect(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        uploadError = "";
        isUploading = true;
        isUploadingMessage = "Analyzing collection...";
        dispatch('processingStart', { message: isUploadingMessage, taskId: 'bulk' });
        
        const fd = new FormData();
        fd.append('file', file);
		if (collectionHint.trim()) fd.append('hint', collectionHint.trim());

        try {
            const res = await fetch('/api/analyze-collection', { method: 'POST', body: fd });

            let data;
            try { data = await res.json(); } catch (err) { data = null; }

            if (res.ok && data?.success) {
                draftPath = data.draftPath;
                draftNoteId = data.noteId;
                collectionType = data.collectionType;
                items = data.items.map((item: any, id: number) => ({
                    ...item,
                    id: id.toString(), // For keying flip animations
                    swipeOffset: 0,
                    isSwiping: false,
                    optedOut: false
                }));

                // Pre-fill global category based on the most common item category detected
                const catCounts = items.reduce((acc, it) => {
                    const c = it.category?.toLowerCase() || '';
                    if (c) acc[c] = (acc[c] || 0) + 1;
                    return acc;
                }, {});
                globalCategory = Object.keys(catCounts).sort((a,b) => catCounts[b] - catCounts[a])[0] || '';
                isDirty = true;

            } else {
                uploadError = data?.error || "We couldn't process the image. Please try again.";
            }
        } catch (err) {
            uploadError = "Network connection lost. Please check your internet and try again.";
        } finally {
            isUploading = false;
            dispatch('processingComplete', { taskId: 'bulk', status: uploadError ? 'error' : 'success' });
        }
    }

    function toggleItem(id: string) {
        items = items.map(x => x.id === id ? { ...x, optedOut: !x.optedOut, swipeOffset: 0 } : x);
    }

    function openEdit(i: number) {
        editingIndex = i;
        editTitle = items[i].title;
        editSubtitle = items[i].subtitle;
        editModal.showModal();
    }
    
    function saveEdit() {
        if (editingIndex >= 0) {
            items[editingIndex].title = editTitle;
            items[editingIndex].subtitle = editSubtitle;
        }
        editModal.close();
    }

    let isSaving = false;

    $: activeItems = items.filter(i => !i.optedOut);


    async function saveCollection() {
        if (selectedContainers.length === 0) {
            alert("Please scan or select a location to assign these items.");
            settingsExpanded = true;
            setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
            return;
        }

        if (activeItems.length === 0) {
            alert("No items selected to save.");
            return;
        }

        isSaving = true;
        
        const res = await fetch('/api/bulk-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                draftPath,
                noteId: draftNoteId,
                containers: selectedContainers,
                globalCategory,
                tagcsv: globalTags,
                items: activeItems.map(item => ({ title: item.title, subtitle: item.subtitle, category: item.category, box: item.box }))
            })
        });
        
        if (res.ok) {
            isDirty = false;
            await goto('/', { invalidateAll: true });
        } else {
            alert("Failed to save.");
            isSaving = false;
        }
    }
</script>

<div class="max-w-md mx-auto w-full pt-2 pb-32 px-4">
    {#if uploadError}
        <ContentUnavailable 
            type="warning"
            icon="bi-robot"
            title="Analysis Interrupted" 
            message={uploadError} 
            actionLabel="Dismiss" 
            on:click={() => uploadError = ""} 
        />
    {:else if !draftPath}
        <div class="flex flex-col items-center justify-center p-6 text-center animate-fade-in mt-10">
            <div class="bg-primary/10 text-primary w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm">
                <i class="bi bi-collection text-4xl"></i>
            </div>
            <h2 class="text-2xl font-bold mb-3 tracking-tight">New Collection</h2>
            <p class="text-gray-500 mb-8 max-w-sm">Capture an entire collection of books, games, whiskys, stamps, coins or CDs/DVDs. Sky's the limit. We'll extract them all instantly.<br><br><strong>Tip:</strong> Keep the phone steady and ensure text is legible.</p>

			{#if !showHintInput}
				<button type="button" class="btn btn-ghost btn-sm text-gray-400 hover:text-primary mb-6 rounded-xl" on:click={() => showHintInput = true}>
					<i class="bi bi-lightbulb"></i> Add a hint
				</button>
			{:else}
				<div class="w-full max-w-sm mb-6 animate-fade-in text-left">
					<div class="flex justify-between items-center mb-1 px-1"><span class="text-[10px] font-semibold uppercase text-gray-500 tracking-wider">Optional Hint</span><button type="button" class="text-[10px] text-gray-400 hover:text-error uppercase tracking-wider font-bold" on:click={() => {showHintInput = false; collectionHint = "";}}>Remove</button></div>
					<input type="text" bind:value={collectionHint} placeholder="e.g. 'Games' 'Signs', or 'Books'" class="input input-bordered w-full rounded-2xl bg-base-100/50 focus:bg-base-100 transition-colors shadow-sm" />
				</div>
			{/if}

            {#if isUploading}
				<div class="btn btn-primary btn-lg w-full max-w-sm rounded-2xl opacity-80 cursor-not-allowed h-auto min-h-[4rem] py-3 flex flex-col justify-center leading-tight">
					<div class="flex items-center gap-3">
						<span class="loading loading-spinner shrink-0"></span> 
						<span class="whitespace-normal break-words">{isUploadingMessage}</span>
					</div>
                </div>
            {:else}
                <div class="flex gap-3 w-full max-w-sm justify-center">
                    <button type="button" class="btn btn-primary flex-1 shadow-lg rounded-2xl active:scale-95 transition-transform" on:click={() => fileInputCamera.click()}><i class="bi bi-camera text-xl"></i> Camera</button>
                    <button type="button" class="btn btn-secondary flex-1 shadow-lg rounded-2xl active:scale-95 transition-transform" on:click={() => fileInputGallery.click()}><i class="bi bi-images text-xl"></i> Gallery</button>
                </div>
            {/if}
            <input type="file" bind:this={fileInputCamera} accept="image/*" capture="environment" class="hidden" on:change={handleFileSelect} />
            <input type="file" bind:this={fileInputGallery} accept="image/*" class="hidden" on:change={handleFileSelect} />
        </div>
    {:else}
        <!-- Header -->
        <div class="mb-4 animate-fade-in bg-base-100/90 backdrop-blur-md sticky top-[60px] z-40 py-2 border-b border-base-200">
            <h2 class="text-2xl font-bold tracking-tight mb-1">Found {items.length} {collectionType || 'items'}</h2>
            <p class="text-success font-medium text-sm flex items-center gap-2"><i class="bi bi-magic"></i> Extracted from image</p>
        </div>

        <!-- The Interactive List -->
        <div class="flex flex-col gap-0 pb-8">
            {#each items as item (item.id)}
                {@const ymin = Math.max(0, item.box[0] - 25)}
                {@const xmin = Math.max(0, item.box[1] - 25)}
                {@const ymax = Math.min(1000, item.box[2] + 25)}
                {@const xmax = Math.min(1000, item.box[3] + 25)}
                {@const w = Math.max(1, xmax - xmin)}
                {@const h = Math.max(1, ymax - ymin)}

                <!-- Swipe container - pan-y stops mobile Safari backwards nav! -->
                <div animate:flip={{duration: 250}} class="relative w-full mb-3 rounded-2xl {item.optedOut ? 'bg-success/90' : 'bg-error/90'} overflow-hidden" style="touch-action: pan-y;"
                     on:touchstart={(e) => { item.touchStartX = e.touches[0].clientX; item.isSwiping = true; }}
                     on:touchmove={(e) => { 
                         if (!item.isSwiping) return; 
                         const diff = e.touches[0].clientX - item.touchStartX; 
                         if (diff < 0) { item.swipeOffset = diff; items = items; } 
                     }}
                     on:touchend={(e) => { 
                         item.isSwiping = false; 
                         if (item.swipeOffset < -80) { 
                             toggleItem(item.id);
                             if (navigator.vibrate) navigator.vibrate(40);
                         } else { 
                             item.swipeOffset = 0; items = items; 
                         } 
                     }}
                >
                    <div class="absolute inset-y-0 right-0 flex items-center pr-6 text-white pointer-events-none">
                        <i class="bi {item.optedOut ? 'bi-arrow-counterclockwise' : 'bi-trash3-fill'} text-xl"></i>
                    </div>

                    <div class="group flex items-center gap-4 bg-base-100 shadow-sm border border-base-200 p-3 rounded-2xl w-full transition-all select-none {item.optedOut ? 'opacity-40 grayscale' : 'hover:border-primary/30 active:scale-[0.98]'}"
                         style="transform: translateX({item.swipeOffset}px); transition: {item.isSwiping ? 'none' : 'transform 0.2s cubic-bezier(0.1, 0.7, 0.1, 1)'}"
                         on:click={() => { 
                             if (Math.abs(item.swipeOffset) > 5) return;
                             if (item.optedOut) toggleItem(item.id);
                             else openEdit(items.indexOf(item)); 
                         }}
                         role="button" tabindex="0"
                    >
                        <!-- The Magic Zoom -->
                        <button type="button" class="relative w-16 h-20 overflow-hidden rounded-lg shrink-0 bg-base-300 border-none p-0 cursor-zoom-in block" on:click|stopPropagation={() => lightbox.open({ orgPath: draftPath, thumbPath: draftPath, showOriginal: true, box: item.box })}>
							<img src="{draftPath}" class="absolute max-w-none origin-top-left object-cover"
                                 style="width: {100000 / w}%; height: {100000 / h}%; left: -{(xmin / w) * 100}%; top: -{(ymin / h) * 100}%;" 
                                 alt="{item.title}" />
                        </button>

                        <div class="flex-1 min-w-0 pr-2">
                            <div class="font-bold text-base text-base-content truncate {item.optedOut ? 'line-through' : ''}">{item.title}</div>
                            <div class="text-sm text-gray-500 truncate">{item.subtitle || 'Unknown Detail'}</div>
                            <div class="flex gap-2 mt-1">
                                <span class="badge badge-ghost badge-sm text-[10px] uppercase font-bold border-base-300">{item.category}</span>
                                {#if item.low_confidence}
                                    <span class="badge badge-warning badge-sm text-[10px] uppercase font-bold"><i class="bi bi-exclamation-triangle mr-1"></i> Blurry</span>
                                {/if}
                            </div>
                        </div>

                        <!-- Desktop Hover Delete/Restore Button -->
                        <button class="hidden md:flex btn btn-circle btn-ghost btn-sm transition-all z-10 {item.optedOut ? 'text-success hover:bg-success/10 opacity-100' : 'text-gray-300 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100'}" 
                                on:click|stopPropagation={() => toggleItem(item.id)} aria-label="Toggle item">
                            <i class="bi {item.optedOut ? 'bi-arrow-counterclockwise text-xl' : 'bi-trash3-fill'}"></i>
                        </button>
                        
                        <i class="bi bi-chevron-right text-gray-300 shrink-0 md:hidden pointer-events-none"></i>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Bulk Settings Accordion -->
        <div class="collapse collapse-arrow bg-base-200 mb-6 rounded-2xl border border-base-300 shadow-sm animate-fade-in">
            <input type="checkbox" bind:checked={settingsExpanded} /> 
            <div class="collapse-title font-bold flex items-center gap-3">
                <div class="bg-primary/20 text-primary w-8 h-8 rounded-full flex items-center justify-center shrink-0"><i class="bi bi-sliders"></i></div>
                Settings & Location
            </div>
            <div class="collapse-content flex flex-col gap-4">
                <div class="bg-base-100 rounded-xl p-1 border border-base-200">
                    <ContainerSelector {containers} on:change={(e) => selectedContainers = e.detail.containers} />
                </div>
                <div class="form-control">
                    <label class="label"><span class="label-text font-semibold">Global Category</span></label>
                    <input type="text" bind:value={globalCategory} placeholder="e.g. book, dvd, cd" class="input input-bordered w-full bg-base-100 rounded-xl" />
                </div>
                <div class="form-control">
                    <label class="label"><span class="label-text font-semibold">Global Tags</span></label>
                    <input type="text" bind:value={globalTags} placeholder="e.g. donate, trash, read, living-room" class="input input-bordered w-full bg-base-100 rounded-xl" />
                    <div class="label"><span class="label-text-alt text-gray-500">Comma separated</span></div>
                </div>
            </div>
        </div>

        <div class="fixed bottom-0 left-0 w-full p-4 bg-base-100/90 backdrop-blur-xl border-t border-base-200 z-50">
            <button class="btn btn-primary btn-lg w-full max-w-md mx-auto block rounded-2xl shadow-lg active:scale-95 transition-transform" on:click={saveCollection} disabled={isSaving || activeItems.length === 0 || selectedContainers.length === 0}>
                {#if isSaving}
                    <span class="loading loading-spinner"></span> Saving...
                {:else}
                    Save {activeItems.length} Item{activeItems.length === 1 ? '' : 's'}
                {/if}
            </button>
        </div>
    {/if}
</div>

<!-- Native Bottom Sheet Editor -->
<dialog bind:this={editModal} class="modal modal-bottom sm:modal-middle" on:close={() => editingIndex = -1}>
    <div class="modal-box p-6 sm:rounded-3xl bg-base-100/95 backdrop-blur-xl">
        <h3 class="font-bold text-xl mb-4">Edit Item</h3>
        <div class="form-control w-full mb-3">
            <label class="label"><span class="label-text font-semibold">Title</span></label>
            <input type="text" bind:value={editTitle} class="input input-bordered w-full rounded-xl" />
        </div>
        <div class="form-control w-full mb-6">
            <label class="label"><span class="label-text font-semibold">Subtitle</span></label>
            <input type="text" bind:value={editSubtitle} class="input input-bordered w-full rounded-xl" />
        </div>
        <div class="modal-action mt-0 flex gap-2">
            <button type="button" class="btn btn-ghost flex-1 rounded-xl" on:click={() => editModal.close()}>Cancel</button>
            <button type="button" class="btn btn-primary flex-1 rounded-xl shadow-md" on:click={saveEdit}>Save Changes</button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<ImageLightbox bind:this={lightbox} itemTitle="Collection Scan" />
