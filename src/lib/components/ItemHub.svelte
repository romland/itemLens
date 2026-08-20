<!-- src/lib/components/ItemHub.svelte -->
<script lang="ts">
    import MediaHub from "$lib/components/add/MediaHub.svelte";
    import ContainerSelector from "$lib/components/ContainerSelector.svelte";
    import QRurlScanner from "$lib/components/QRurlScanner.svelte";
    import AttributeAdder from "$lib/components/AttributeAdder.svelte";
    import ItemMiniCard from "$lib/components/ItemMiniCard.svelte";
    import RefreshDeleteList from "$lib/components/RefreshDeleteList.svelte";
    import ImageLightbox from "$lib/components/ImageLightbox.svelte";
    import { photoTypes } from "$lib/shared/constants";
    import { marked } from 'marked';
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();

    export let containers = [];
    export let item: any = null;
    export let saving = false;
    export let isDirty = false;
    export let pastedDocCount = 0;

    // View state machine: 'hub', 'photos', 'location', 'links', 'details'
    let activeView = 'hub';

    // State for the Hub Badges
    let photoCount = item?.photos?.length || 0;
    let selectedLocations = item?.locations?.map(l => l.container?.name) || [];
    let qrScannerCount = 0;
    $: linkCount = (item?.documents?.length || 0) + qrScannerCount + pastedDocCount;

    let currentTitle = item?.title || "";
    let currentDescription = item?.description || "";
    let amount = item?.amount || "";
    let reason = item?.reason || "";
    let tagcsv = item?.tagcsv || "";
    let currentAttributes = item?.attributes ? [...item.attributes] : [];

    let isAnalyzing = false;
    let pendingPhotos: any[] = [];
    let showPreview = false;
    let currentDraftPath = "";
    let isDuplicateWarning = false;
    let duplicateDetails: any = null;
    let duplicateDismissed = false;

    // Dirty State Reactivity
    $: {
        let dirty = false;
        if (currentTitle !== (item?.title || "")) dirty = true;
        if (currentDescription !== (item?.description || "")) dirty = true;
        if (String(amount) !== String(item?.amount || "")) dirty = true;
        if (reason !== (item?.reason || "")) dirty = true;
        if (tagcsv !== (item?.tagcsv || "")) dirty = true;
        if (pendingPhotos.length > 0) dirty = true;
        if (qrScannerCount > 0) dirty = true;
        if (pastedDocCount > 0) dirty = true;
        
        const initialLocations = item?.locations?.map(l => l.container?.name).sort().join(',') || "";
        const currentLocs = [...selectedLocations].sort().join(',');
        if (initialLocations !== currentLocs) dirty = true;
        
        if (dirty) isDirty = true;
    }

    // Default draft preview logic
    $: previewImagePath = pendingPhotos.length > 0
        ? pendingPhotos[pendingPhotos.length - 1].localUrl 
        : item?.photos?.find(p => p.type === 'product')?.cropPath || item?.photos?.find(p => p.type === 'product')?.orgPath || "";

    $: serverImagePath = currentDraftPath 
        || item?.photos?.find(p => p.type === 'product')?.cropPath 
        || item?.photos?.find(p => p.type === 'product')?.orgPath 
        || "";

    let showAiDrawer = false;
    let userHint = "";
    let isRefining = false;
    let aiDialog: HTMLDialogElement;
    let lightbox: ImageLightbox;

    $: if (aiDialog) {
        if (showAiDrawer && !aiDialog.open) aiDialog.showModal();
        if (!showAiDrawer && aiDialog.open) aiDialog.close();
    }

    function handleAnalyzingStart(ev: any) {
        isAnalyzing = true;
    }

    function handleAnalyzingComplete(ev: any) {
        isAnalyzing = false;
        const data = ev.detail;
        if (data && data.draftPath) {
            currentDraftPath = data.draftPath;
        }        
        if (data && data.aiData) {
            if (data.aiData.isDuplicate && !item) {
                isDuplicateWarning = true;
                duplicateDetails = data.aiData.duplicateItemDetails;
                dispatch('notify', { status: 'warning', message: 'Potential duplicate detected in inventory!' });
            }
            let autofilled = false;
            if (!currentTitle && data.aiData.title) {
                currentTitle = data.aiData.title;
                autofilled = true;
            }
            if (!currentDescription && data.aiData.description) {
                currentDescription = data.aiData.description;
                autofilled = true;
            }
            if (data.aiData.extractedAttributes) {
                try {
                    const attrs = typeof data.aiData.extractedAttributes === 'string' ? JSON.parse(data.aiData.extractedAttributes) : data.aiData.extractedAttributes;
                    let foundNew = false;
                    for (const [k, v] of Object.entries(attrs)) {
                        if (v !== null && v !== '') {
                            if (!currentAttributes.some(a => a.key === k)) {
                                currentAttributes = [...currentAttributes, { key: k, value: String(v) }];
                                foundNew = true;
                            }
                        }
                    }
                    if (foundNew) { autofilled = true; isDirty = true; }
                } catch (e) { console.error("Failed to parse AI attributes", e); }
            }

            if (autofilled) {
                dispatch('success', 'AI auto-filled details!');
            }
        }
    }   

    function handlePendingChange(ev: any) {
        pendingPhotos = ev.detail;
        photoCount = (item?.photos?.length || 0) + pendingPhotos.length;
    }

    function changePendingType(index: number, newType: string) {
        // Find the hidden input generated by MultiImageUpload and force its value
        const hiddenInput = document.querySelector(`input[name="file.type.${index}"]`) as HTMLInputElement;
        if (hiddenInput) {
            hiddenInput.value = newType;
        }
        pendingPhotos = pendingPhotos.map(p => p.index === index ? { ...p, type: newType } : p);
    }

    async function runAiRefine() {
        if (!userHint.trim() || !serverImagePath) return;
        
        isRefining = true;
        try {
            let res;
            if (item?.id) {
                res = await fetch('/api/ai-refine', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        itemId: item.id,
                        hint: userHint 
                    })
                });
            } else {
                res = await fetch('/api/analyze-draft-refine', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        draftPath: serverImagePath,
                        hint: userHint 
                    })
                });
            }
            
            if (res.ok) {
                const result = await res.json();
                const aiData = result.aiData || result;
                if (aiData.title) currentTitle = aiData.title;
                if (aiData.description) currentDescription = aiData.description;
                showAiDrawer = false;
                userHint = "";
                dispatch('success', 'Item details enhanced by model!');
            } else {
                alert("AI Refinement failed. Check server logs.");
                showAiDrawer = false;
            }
        } catch (e) {
            console.error(e);
        } finally {
            isRefining = false;
        }
    }
</script>

<div class="relative w-full md:max-w-2xl mx-auto bg-base-100 md:rounded-[2rem] rounded-xl shadow-lg md:shadow-2xl border border-base-200 flex flex-col">
    
    <!-- ================= THE HUB VIEW ================= -->
    <div class="{activeView === 'hub' ? 'flex' : 'hidden'} flex-col flex-1 p-4 sm:p-8 pb-0 animate-fade-in">
        <div class="text-center mb-8">
            <h2 class="text-2xl font-bold">{currentTitle || (item ? 'Edit Item' : 'New Item')}</h2>
            <p class="text-gray-500 text-sm">
                {#if isAnalyzing}
                    <span class="loading loading-spinner loading-xs text-primary align-middle mr-1"></span> Analyzing...
                {:else}
                    {item ? 'Update sections below' : 'Tap camera to start, or select a section below'}
                {/if}
            </p>
        </div>

        {#if isDuplicateWarning && duplicateDetails}
            <div class="alert bg-warning/20 border border-warning/50 text-warning-content shadow-sm rounded-xl mb-6 py-3 animate-fade-in items-start">
                <i class="bi bi-intersect text-warning text-xl mt-0.5"></i>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-sm mb-2">Potential Duplicate</h3>
                    
                    <ItemMiniCard item={duplicateDetails} on:zoom={() => lightbox.open({ orgPath: duplicateDetails.thumbPath || duplicateDetails.orgPath, showOriginal: true })} />

                    <div class="text-[11px] mt-2 flex flex-col gap-1">
                        <div class="flex items-center justify-between gap-2 px-1">
                            <span class="text-gray-500 font-bold uppercase tracking-wider text-[9px]">Original Added:</span> 
                            <span class="font-medium text-right">{new Date(duplicateDetails.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {#if duplicateDetails.sharedAttributes?.length > 0}
                            <div class="flex flex-col mt-1 pt-1.5 border-t border-warning/10">
                                <span class="text-gray-500 font-semibold uppercase tracking-wider mb-1">Matched Attributes:</span>
                                <div class="flex flex-wrap gap-1">
                                    {#each duplicateDetails.sharedAttributes as attr}
                                        <span class="badge badge-warning badge-outline text-[9px] font-mono font-bold h-auto py-0.5">{attr.key}: {attr.value}</span>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
                <button type="button" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label="Dismiss" on:click={() => { isDuplicateWarning = false; duplicateDismissed = true; }}><i class="bi bi-x-lg"></i></button>
            </div>
        {/if}

        <!-- HERO CAMERA BUTTON (Pure 1-Tap Capture) -->
        <div class="flex justify-center items-center gap-4 mb-4 relative">
            <!-- Gallery Button -->
            <button type="button" class="btn btn-secondary btn-circle h-14 w-14 shadow-lg hover:scale-105 active:scale-95 transition-transform p-0 bg-base-100 text-base-content border-base-200" aria-label="Add from Gallery"
                on:click={() => {
                    const fileInputs = document.querySelectorAll('input[type="file"][name^="file."]');
                    const fileInput = fileInputs[fileInputs.length - 1] as HTMLInputElement;
                    const typeInputs = document.querySelectorAll('input[type="hidden"][name^="file.type."]');
                    const typeInput = typeInputs[typeInputs.length - 1] as HTMLInputElement;
                    if (fileInput && typeInput) {
                        typeInput.value = 'product';
                        fileInput.removeAttribute('capture');
                        fileInput.click();
                    }
                }}>
                <i class="bi bi-images text-xl"></i>
            </button>

            <div class="relative">
                <button type="button" class="btn btn-primary btn-circle h-28 w-28 shadow-xl hover:scale-105 active:scale-95 transition-transform overflow-hidden p-0" aria-label="Quick Take Photo"
                on:click={() => {
                    const fileInputs = document.querySelectorAll('input[type="file"][name^="file."]');
                    const fileInput = fileInputs[fileInputs.length - 1] as HTMLInputElement;
                    const typeInputs = document.querySelectorAll('input[type="hidden"][name^="file.type."]');
                    const typeInput = typeInputs[typeInputs.length - 1] as HTMLInputElement;
                    if (fileInput && typeInput) {
                        typeInput.value = 'product';
                        fileInput.setAttribute('capture', 'environment');
                        fileInput.click();
                    }
                }}>
                {#if pendingPhotos.length > 0 && pendingPhotos[pendingPhotos.length - 1].isAnalyzing}
                    <div class="absolute inset-0 bg-base-100/60 backdrop-blur-sm flex items-center justify-center z-10">
                        <span class="loading loading-spinner loading-lg text-primary"></span>
                    </div>
                {/if}
                
                {#if previewImagePath}
                    <img src={previewImagePath} alt="Preview" class="w-full h-full object-cover" />
                {:else}
                    <i class="bi bi-camera text-5xl"></i>
                {/if}
                </button>
                {#if photoCount > 0}
                    <div class="absolute top-0 right-[calc(50%-4rem)] bg-success text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-md border-2 border-base-100 z-10 pointer-events-none">
                        <i class="bi bi-check-lg"></i>
                    </div>
                {/if}
            </div>

            <!-- File/Doc Button -->
            <button type="button" class="btn btn-secondary btn-circle h-14 w-14 shadow-lg hover:scale-105 active:scale-95 transition-transform p-0 bg-base-100 text-base-content border-base-200" aria-label="Add Document"
                on:click={() => {
                    const fileInputs = document.querySelectorAll('input[type="file"][name^="file."]');
                    const fileInput = fileInputs[fileInputs.length - 1] as HTMLInputElement;
                    const typeInputs = document.querySelectorAll('input[type="hidden"][name^="file.type."]');
                    const typeInput = typeInputs[typeInputs.length - 1] as HTMLInputElement;
                    if (fileInput && typeInput) {
                        typeInput.value = 'information';
                        fileInput.removeAttribute('capture');
                        fileInput.click();
                    }
                }}>
                <i class="bi bi-folder2-open text-xl"></i>
            </button>
        </div>

        <!-- RECENT CAPTURES FILMSTRIP -->
        {#if pendingPhotos.length > 0}
            <div class="flex gap-3 overflow-x-auto py-2 mb-8 max-w-lg mx-auto snap-x hide-scrollbar">
                {#each pendingPhotos as photo}
                    <div class="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden shadow-sm border border-base-200 snap-center bg-base-200 group">
                        <img src={photo.localUrl} class="w-full h-full object-cover" alt="Captured" />
                        {#if photo.isAnalyzing}
                            <div class="absolute inset-0 bg-base-100/50 flex items-center justify-center">
                                <span class="loading loading-spinner loading-sm text-primary"></span>
                            </div>
                        {:else}
                            <div class="absolute bottom-0 w-full opacity-90 group-hover:opacity-100 transition-opacity">
                                <select 
                                    class="select select-xs w-full bg-base-300 text-base-content border-none focus:outline-none rounded-none text-[10px] h-6 min-h-0 px-1 font-semibold"
                                    value={photo.type}
                                    on:change={(e) => changePendingType(photo.index, e.currentTarget.value)}
                                >
                                    <option value="product">Product</option>
                                    <option value="invoice or receipt">Receipt</option>
                                    <option value="information">Info</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

        <div class="flex flex-col gap-3 max-w-lg mx-auto flex-1 w-full {!pendingPhotos.length ? 'mt-10' : ''}">
            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-between items-center rounded-xl border-base-300 hover:border-primary hover:bg-base-50" on:click={() => activeView = 'photos'}>
                <div class="flex items-center gap-4">
                    <div class="bg-blue-100 text-blue-600 w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0">
                        <i class="bi bi-camera"></i>
                    </div>
                    <div class="text-left">
                        <div class="font-bold text-base">Photos</div>
                        <div class="text-xs text-gray-500 font-normal">Upload or fetch</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    {#if photoCount > 0}
                        <span class="badge badge-primary">{photoCount}</span>
                    {/if}
                    <i class="bi bi-chevron-right text-gray-400"></i>
                </div>
            </button>

            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-between items-center rounded-xl border-base-300 hover:border-primary hover:bg-base-50" on:click={() => activeView = 'location'}>
                <div class="flex items-center gap-4">
                    <div class="bg-purple-100 text-purple-600 w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0">
                        <i class="bi bi-box-seam"></i>
                    </div>
                    <div class="text-left">
                        <div class="font-bold text-base">Location</div>
                        <div class="text-xs text-gray-500 font-normal">Scan QR or select</div>
                    </div>
                </div>
                <div class="flex items-center gap-1 flex-wrap justify-end">
                    {#if selectedLocations.length > 0}
                        {#each selectedLocations.slice(0,2) as loc}
                            <span class="badge badge-primary badge-sm font-mono">{loc}</span>
                        {/each}
                        {#if selectedLocations.length > 2}
                            <span class="badge badge-primary badge-sm">+{selectedLocations.length - 2}</span>
                        {/if}
                    {/if}
                    <i class="bi bi-chevron-right text-gray-400 ml-1"></i>
                </div>
            </button>

            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-between items-center rounded-xl border-base-300 hover:border-primary hover:bg-base-50" on:click={() => activeView = 'details'}>
                <div class="flex items-center gap-4">
                    <div class="bg-orange-100 text-orange-600 w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0">
                        <i class="bi bi-pencil-square"></i>
                    </div>
                    <div class="text-left">
                        <div class="font-bold text-base">Item Details</div>
                        <div class="text-xs text-gray-500 font-normal">Title, qty, tags...</div>
                    </div>
                </div>
                <i class="bi bi-chevron-right text-gray-400"></i>
            </button>

            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-between items-center rounded-xl border-base-300 hover:border-primary hover:bg-base-50" on:click={() => activeView = 'links'}>
                <div class="flex items-center gap-4">
                    <div class="bg-emerald-100 text-emerald-600 w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0">
                        <i class="bi bi-link-45deg"></i>
                    </div>
                    <div class="text-left">
                        <div class="font-bold text-base">Documents</div>
                        <div class="text-xs text-gray-500 font-normal">Manual or scan QR</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    {#if linkCount > 0}
                        <span class="badge badge-primary">{linkCount}</span>
                    {/if}
                    <i class="bi bi-chevron-right text-gray-400"></i>
                </div>
            </button>
        </div>

        <!-- STICKY FOOTER -->
        <input type="hidden" name="duplicateDismissed" value={duplicateDismissed.toString()} />
        <div class="sticky bottom-16 left-0 w-full p-4 bg-base-100/90 backdrop-blur-md border-t border-base-200 rounded-b-xl md:rounded-b-[2rem] mt-6">
            <button disabled={saving || !isDirty} type="submit" class="btn btn-primary btn-lg w-full max-w-lg mx-auto block rounded-xl shadow-md transition-all active:scale-95">
                {#if saving}
                    <span class="loading loading-spinner"></span> Saving...
                {:else}
                    <i class="bi bi-save mr-2 text-xl"></i> {item ? 'Save Changes' : 'Save Item'}
                {/if}
            </button>
        </div>
    </div>

    <!-- ================= SUB-VIEWS ================= -->

    <!-- PHOTOS VIEW -->
    <div class="{activeView === 'photos' ? 'flex' : 'hidden'} flex-col bg-base-100 rounded-xl md:rounded-[2rem] animate-fade-in">
        <div class="flex items-center p-4 sm:p-6 pb-2">
            <button type="button" class="btn btn-circle btn-ghost bg-base-200" aria-label="Back to Hub" on:click={() => activeView = 'hub'}><i class="bi bi-arrow-left text-xl"></i></button>
            <h2 class="text-xl font-bold ml-4">Photos</h2>
        </div>
        <div class="px-2 sm:px-6 pb-6">
            <div class="max-w-lg mx-auto w-full">
                <MediaHub 
                    photoTypes={photoTypes} 
                    photoValues={item?.photos || []}
                    on:success={(ev) => dispatch('success', ev.detail)} 
                    on:analyzingStart={handleAnalyzingStart}
                    on:analyzingComplete={handleAnalyzingComplete}
                    on:pendingChange={handlePendingChange}
                />
            </div>
        </div>
        <div class="sticky bottom-16 p-4 sm:p-6 bg-base-100 border-t border-base-200 rounded-b-xl md:rounded-b-[2rem] ">
            <button type="button" class="btn btn-neutral btn-lg w-full max-w-lg mx-auto block rounded-xl shadow-sm" on:click={() => activeView = 'hub'}><i class="bi bi-check2-circle mr-2"></i> Done</button>
        </div>
    </div>

    <!-- LOCATION VIEW -->
    <div class="{activeView === 'location' ? 'flex' : 'hidden'} flex-col bg-base-100 rounded-xl md:rounded-[2rem] animate-fade-in">
        <div class="flex items-center p-4 sm:p-6 pb-2">
            <button type="button" class="btn btn-circle btn-ghost bg-base-200" aria-label="Back to Hub" on:click={() => activeView = 'hub'}><i class="bi bi-arrow-left text-xl"></i></button>
            <h2 class="text-xl font-bold ml-4">Storage Location</h2>
        </div>
        <div class="px-2 sm:px-6 pb-6">
            <div class="max-w-lg mx-auto w-full">
                <ContainerSelector 
                    containers={containers} 
                    values={item?.locations || []}
                    on:success={(ev) => dispatch('success', ev.detail)}
                    on:change={(ev) => selectedLocations = ev.detail.containers}
                />
            </div>
        </div>
        <div class="sticky bottom-16 p-4 sm:p-6 bg-base-100 border-t border-base-200 rounded-b-xl md:rounded-b-[2rem] ">
            <button type="button" class="btn btn-neutral btn-lg w-full max-w-lg mx-auto block rounded-xl shadow-sm" on:click={() => activeView = 'hub'}><i class="bi bi-check2-circle mr-2"></i> Done</button>
        </div>
    </div>

    <!-- LINKS VIEW -->
    <div class="{activeView === 'links' ? 'flex' : 'hidden'} flex-col bg-base-100 rounded-xl md:rounded-[2rem] animate-fade-in">
        <div class="flex items-center p-4 sm:p-6 pb-2">
            <button type="button" class="btn btn-circle btn-ghost bg-base-200" aria-label="Back to Hub" on:click={() => activeView = 'hub'}><i class="bi bi-arrow-left text-xl"></i></button>
            <h2 class="text-xl font-bold ml-4">Documents</h2>
        </div>
        <div class="px-2 sm:px-6 pb-6">
            <div class="max-w-lg mx-auto w-full">
                {#if item?.documents?.length > 0}
                    <div class="mb-6 bg-base-50/50 p-4 rounded-xl border border-base-200">
                        <h3 class="font-semibold text-sm text-gray-500 mb-3 flex items-center gap-2"><i class="bi bi-file-earmark-text"></i> Existing Documents</h3>
                        <RefreshDeleteList
                            values={item.documents}
                            inputName="documents"
                            columns={({
                                "3":{name:"Document", fieldName:"title", subFieldName:"source", linkFieldName:"path", isImage: false}
                            } as any)}
                        />
                    </div>
                {/if}
                <QRurlScanner 
                    on:success={(ev) => dispatch('success', ev.detail)}
                    on:change={(ev) => qrScannerCount = ev.detail.count}
                    on:processingStart={(ev) => dispatch('processingStart', ev.detail)}
                    on:processingComplete={(ev) => dispatch('processingComplete', ev.detail)}
                />
            </div>
        </div>
        <div class="sticky bottom-16 p-4 sm:p-6 bg-base-100 border-t border-base-200 rounded-b-xl md:rounded-b-[2rem] ">
            <button type="button" class="btn btn-neutral btn-lg w-full max-w-lg mx-auto block rounded-xl shadow-sm" on:click={() => activeView = 'hub'}><i class="bi bi-check2-circle mr-2"></i> Done</button>
        </div>
    </div>

    <!-- DETAILS VIEW -->
    <div class="{activeView === 'details' ? 'flex' : 'hidden'} flex-col bg-base-100 rounded-xl md:rounded-[2rem] animate-fade-in">
        <div class="flex items-center p-4 sm:p-6 pb-2">
            <button type="button" class="btn btn-circle btn-ghost bg-base-200" aria-label="Back to Hub" on:click={() => activeView = 'hub'}><i class="bi bi-arrow-left text-xl"></i></button>
            <h2 class="text-xl font-bold ml-4">Item Details</h2>
        </div>

        <div class="px-4 sm:px-6 pb-6">
            <div class="flex flex-col gap-5 max-w-lg mx-auto w-full">
                <div class="form-control w-full">
                    <div class="label">
                        <span class="label-text font-semibold flex items-center gap-2">
                            Title
                            {#if isAnalyzing}
                                <span class="loading loading-spinner loading-xs text-primary"></span>
                                <span class="text-xs text-primary font-normal">Analyzing image...</span>
                            {/if}
                        </span>
                    </div>
                    <div class="relative w-full">
                        <input type="text" name="title" bind:value={currentTitle} placeholder="Leave blank for auto-fill..." class="input input-bordered w-full pr-12 rounded-xl" class:input-primary={isAnalyzing}>
                        {#if previewImagePath}
                            <button type="button" class="absolute right-3 top-3 text-primary/70 hover:text-primary transition-colors" title="Refine with AI" on:click={() => showAiDrawer = true}>
                                <i class="bi bi-stars text-xl"></i>
                            </button>
                        {/if}
                    </div>
                </div>

                <div class="form-control w-full">
                    <div class="label flex justify-between">
                        <span class="label-text font-semibold">Description</span>
                        <button type="button" class="btn btn-xs btn-ghost text-primary" on:click={() => showPreview = !showPreview}>
                            {showPreview ? 'Edit' : 'Preview'}
                        </button>
                    </div>
                    {#if showPreview}
                        <div class="prose prose-sm max-w-none bg-base-200/50 p-4 rounded-xl border border-base-200 min-h-[5rem]">
                            {@html currentDescription ? marked.parse(currentDescription, { breaks: true, gfm: true }) : '<span class="text-gray-400">Empty</span>'}
                        </div>
                    {:else}
                        <textarea name="description" bind:value={currentDescription} rows="3" placeholder="Notes (Markdown supported)..." class="textarea textarea-bordered w-full rounded-xl" class:textarea-primary={isAnalyzing}></textarea>
                    {/if}
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="form-control w-full">
                        <div class="label"><span class="label-text font-semibold">Amount</span></div>
                        <input type="number" name="amount" bind:value={amount} placeholder="1" class="input input-bordered w-full rounded-xl">
                    </div>
                    <div class="form-control w-full">
                        <div class="label"><span class="label-text font-semibold">Reason</span></div>
                        <input type="text" name="reason" bind:value={reason} placeholder="Project Apollo" class="input input-bordered w-full rounded-xl">
                    </div>
                </div>

                <div class="form-control w-full">
                    <div class="label"><span class="label-text font-semibold">Tags</span></div>
                    <input type="text" name="tagcsv" bind:value={tagcsv} placeholder="electronics, office, spare..." class="input input-bordered w-full rounded-xl">
                    <div class="label"><span class="label-text-alt text-gray-400">Separated by comma.</span></div>
                </div>

                <div class="form-control w-full">
                    <div class="label"><span class="label-text font-semibold">Attributes</span></div>
                    <div class="bg-base-200/50 p-3 rounded-xl border border-base-200" on:input={() => isDirty = true}>
                        {#key currentAttributes}
                            <AttributeAdder values={currentAttributes} on:change={() => isDirty = true} />
                        {/key}
                    </div>
                </div>
            </div>
        </div>
        
        <div class="sticky bottom-16 p-4 sm:p-6 bg-base-100 border-t border-base-200 rounded-b-xl md:rounded-b-[2rem] ">
            <button type="button" class="btn btn-neutral btn-lg w-full max-w-lg mx-auto block rounded-xl shadow-sm" on:click={() => activeView = 'hub'}><i class="bi bi-check2-circle mr-2"></i> Done</button>
        </div>
    </div>
</div>

<!-- The Bottom Drawer for LLM Refinement -->
<dialog bind:this={aiDialog} class="modal modal-top sm:modal-middle" on:close={() => showAiDrawer = false}>
    <div class="modal-box w-full max-w-[95vw] sm:max-w-md mx-auto mt-4 sm:mt-0 p-6 bg-base-100/95 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl">
        <h3 class="font-bold text-xl mb-2 flex items-center gap-2">
            <i class="bi bi-stars text-primary"></i> Refine Guess
        </h3>
        <p class="text-sm text-gray-500 mb-6">Give the AI a nudge with a brand or model name to get a better match.</p>
        
        <input type="text" bind:value={userHint} on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runAiRefine(); } }} placeholder="e.g. It's actually a MITTZON desk" class="input input-bordered w-full rounded-xl mb-4" />
        
        <div class="modal-action mt-0 flex gap-2">
            <button type="button" class="btn btn-ghost rounded-xl flex-1" on:click={() => showAiDrawer = false}>Cancel</button>
            <button type="button" class="btn btn-primary rounded-xl flex-1 shadow-md" on:click={runAiRefine} disabled={isRefining}>
                {#if isRefining}
                    <span class="loading loading-spinner"></span>
                {:else}
                    Enhance
                {/if}
            </button>
        </div>
    </div>
    <div class="modal-backdrop">
        <button type="button" on:click={() => showAiDrawer = false}>close</button>
    </div>
</dialog>

<ImageLightbox bind:this={lightbox} />
