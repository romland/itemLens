<script lang="ts">
    import type { PageServerData } from "./$types";
    import Delete from "$lib/components/delete.svelte";
    import { toTextDocument, refine, refineForLLM } from "$lib/shared/ocrparser";
    import { afterNavigate, beforeNavigate, invalidateAll } from '$app/navigation'
    import { marked } from "marked";
    import { enhance } from "$app/forms";
    import PasteHandler from "$lib/components/PasteHandler.svelte";
    import ImageLightbox from "$lib/components/ImageLightbox.svelte";
    import InvoiceViewer from "$lib/components/InvoiceViewer.svelte";
    import DuplicateResolution from "$lib/components/DuplicateResolution.svelte";
    import CompareAttributeSheet from "$lib/components/compare/CompareAttributeSheet.svelte";
    import RelativeDate from "$lib/components/RelativeDate.svelte";
    import DocumentLightbox from "$lib/components/DocumentLightbox.svelte";
    import ColorMixBar from "$lib/components/ColorMixBar.svelte";
    import ItemMiniCard from "$lib/components/ItemMiniCard.svelte";
    import ItemSelectorModal from "$lib/components/ItemSelectorModal.svelte";
    import ContainerSelector from "$lib/components/ContainerSelector.svelte";
    import ConfirmModal from "$lib/components/ConfirmModal.svelte";
    import { notify } from "$lib/client/notifications";
    import { dev } from '$app/environment';

    export let data: PageServerData;
    
    let productPhotos = [], invoicePhotos = [], otherPhotos = [];
    let photoAttributes = [];
    let isSavingPasted = false;
    let lightbox: ImageLightbox;
    let docLightbox: DocumentLightbox;
    let isProcessingItem = false;
    let attrModal: HTMLDialogElement;
    let duplicateDeleteModal: Delete;
    let diagnosticModal: HTMLDialogElement;
    let pasteHandler: PasteHandler;
    let confirmModal: ConfirmModal;
    let moveModal: HTMLDialogElement;
    let isMoving = false;
    let globalContainers: any[] = [];
    let isLoadingContainers = false;

    let payloadModal: HTMLDialogElement;
    let payloadModalTitle = "";
    let payloadModalContent = "";
    function openPayloadModal(log: any) {
        payloadModalTitle = log.action;
        payloadModalContent = log.payload;
        payloadModal.showModal();
    }

    let devDebugModal: HTMLDialogElement;
    let devTargetId = '';
    let devDebugResult: any = null;
    let isDevDebugging = false;
    let selectorModal: ItemSelectorModal;
    let selectedTargetItem: any = null;
    
    // Assistant State
    let aiQuestion = "";
    let isAskingAi = false;
    let includePhotoContext = true;

    async function runDevDebug() {
        if (!selectedTargetItem) return;
        isDevDebugging = true;
        try {
            const res = await fetch('/api/debug-match', {
                method: 'POST',
                body: JSON.stringify({ sourceId: data.item?.id, targetId: Number(selectedTargetItem.id) })
            });
            devDebugResult = await res.json();
        } finally {
            isDevDebugging = false;
        }
    }

    async function askAiQuestion() {
        if (!aiQuestion.trim() || !data.item?.id) return;
        isAskingAi = true;
        try {
            const res = await fetch('/api/ask-item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: data.item.id, question: aiQuestion, includePhoto: includePhotoContext && productPhotos.length > 0 })
            });
            if (res.ok) {
                notify('success', 'Answer added to Local Archive!');
                aiQuestion = "";
                invalidateAll(); // Smoothly refresh data without a full page reload
            } else notify('error', 'Failed to generate answer.');
        } catch (e) {
            notify('error', 'Network error.');
        } finally {
            isAskingAi = false;
        }
    }

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
        if (!data.item?.id) return;
        isMoving = true;
        try {
            const res = await fetch('/api/item', { 
                method: 'PATCH', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ itemId: data.item.id, newContainer }) 
            });
            if (res.ok) {
                notify('success', `Moved to ${newContainer}`);
                window.location.reload();
            } else notify('error', 'Failed to move item.');
        } catch (e) { notify('error', 'Network error.'); } 
        finally { isMoving = false; moveModal.close(); }
    }

    // Svelte Reactivity: Whenever SvelteKit's 'data' prop updates (via form action or SSE invalidateAll),
    // this block automatically re-runs and updates our local state instantly.
    $: {
        if(data.item?.photos?.length > 0) {
            productPhotos = data.item.photos.filter((photo) => { return photo.type === "product" });
            invoicePhotos = data.item.photos.filter((photo) => { return photo.type === "invoice or receipt" });
            otherPhotos =  data.item.photos.filter((photo) => { return photo.type === "information" || photo.type === "other" });
        } else {
            productPhotos = []; invoicePhotos = []; otherPhotos = [];
        }
        
        // // Heuristic: If any photo lacks a thumbnail, or any web document lacks a downloaded path, we are still processing.
        // isProcessingItem = data.item?.photos?.some(p => !p.thumbPath) || 
        //                    data.item?.documents?.some(d => !d.path && d.type !== 'note');
        // // Heuristic: If any RECENT photo/doc lacks a thumbnail/path, we are still processing.
        // // We ignore items older than 5 minutes so legacy/failed items don't hang the UI forever.
        // const fiveMinsAgo = Date.now() - (5 * 60 * 1000);
        // isProcessingItem = data.item?.photos?.some(p => !p.thumbPath && new Date(p.createdAt).getTime() > fiveMinsAgo) || 
        //                    data.item?.documents?.some(d => !d.path && d.type !== 'note' && new Date(d.createdAt).getTime() > fiveMinsAgo);
        // Driven completely by centralized server state now!
        isProcessingItem = data.activeTasks && data.activeTasks.length > 0;

        // TODO: This should be done during initial processing (once), not every time rendering
        photoAttributes = [];
        
        for(let i = 0; i < data.item.photos?.length; i++) {
            const photo = data.item.photos[i];
            
            try {
                const ocr = JSON.parse(photo.ocr)?.data[0] || [];
                // console.log("photo ocr:", ocr, ocr.length);
                for(let j = 0; j < ocr.length; j++) {
                    if(photo.type !== "product") {
                        continue;
                    }
                    
                    // Add text in product photos to attributes
                    const block = ocr[j];
                    
                    // Too low confidence
                    if(block[1][1] < 0.85) {
                        continue;
                    }
                    
                    // Too short string
                    if(block[1][0].length < 3) {
                        continue;
                    }
                    
                    photoAttributes.push({
                        photo: photo.id,
                        key: "OCR " + i + "." + j,
                        value: block[1][0]
                    })
                }
            } catch(ex) {
                // console.warn("No or faulty OCR data for photo", photo.id)
            }
        }
    }

    function alterSummary(txt)
    {
        if(!txt) return "";
        return marked.parse(txt, {gfm:true,breaks:true});
    }

    let done = false;
$:  if(!done && invoicePhotos.length > 0) {
        const p = invoicePhotos[0];
        if (p && p.llmAnalysis) {
            const end = p.llmAnalysis.lastIndexOf("}");
            const start = p.llmAnalysis.indexOf("{");
            if (start !== -1 && end !== -1) {
                const json = p.llmAnalysis.slice(start, end + 1);
                console.log(json);
                try { console.log(JSON.parse(json)); } catch(e) {}
            }
        }

    }
    
    import pageTitle from '$lib/stores';
$:  pageTitle.set(data.item?.title || 'Item Details');

$:	itemCategories = Array.from(new Set(data.item?.photos?.filter(p => p.category).map(p => p.category.name) || []));
$:  activeSchema = data.activeSchema || [];
$:  itemAttributes = data.item?.attributes?.reduce((acc: any, a: any) => { acc[a.key] = a.value; return acc; }, {}) || {};
$:  hasMissingFields = activeSchema.some(f => 
        f.extractionMethod === 'HUMAN_REQUIRED' || 
        (f.extractionMethod === 'HYBRID' && !itemAttributes[f.name])
    );

$: if (data.duplicateItemDetails?.debugTrace) {
    console.group(`🔍 Match Trace for: ${data.item?.title}`);
    data.duplicateItemDetails.debugTrace.forEach((line: string) => console.log(line));
    console.groupEnd();
}

</script>

<PasteHandler 
    bind:this={pasteHandler}
    formId="pasteForm"
    on:success={() => (document.getElementById('pasteForm') as HTMLFormElement)?.requestSubmit()}
    on:processingComplete={() => {}}
/>

<form id="pasteForm" action="?/addPasted" method="POST" class="hidden" enctype="multipart/form-data" use:enhance={() => {
    isSavingPasted = true;
    return async ({ update }) => {
        await update({ reset: true });
        isSavingPasted = false;
        
        pasteHandler?.clearQueue();
    };
}}></form>

<article style="padding-bottom: 100px;" class="">

    <div class="flex justify-between items-start gap-4 border-b border-base-200/60 pb-3 mb-4 mt-2">
        <div class="flex flex-col flex-1">
            <h1 class="text-3xl sm:text-4xl font-bold text-base-content break-words leading-tight tracking-tight">
                {data.item?.title}
            </h1>
            <div class="text-[11px] text-gray-500 font-medium flex flex-wrap items-center gap-1.5 mt-2">
                <span class="flex items-center gap-1.5"><i class="bi bi-clock-history opacity-70"></i> Added <RelativeDate date={data.item?.createdAt} /></span>
                {#if data.item?.updatedAt && data.item.updatedAt !== data.item.createdAt}
                    <span class="mx-1 opacity-40 hidden sm:inline">•</span> 
                    <span class="hidden sm:flex items-center gap-1.5"><i class="bi bi-pencil opacity-70"></i> Updated <RelativeDate date={data.item.updatedAt} /></span>
                {/if}
            </div>
        </div>
        <div class="inline-flex gap-2 items-center shrink-0 pt-1">
            {#if isSavingPasted}
                <span class="loading loading-spinner loading-sm text-primary"></span>
            {/if}
            <div class="dropdown dropdown-end">
                <button tabindex="0" class="btn btn-circle btn-ghost bg-base-200/50 border-base-300 shadow-sm text-gray-500 hover:text-primary transition-all active:scale-95" aria-label="Item Options">
                    <i class="bi bi-three-dots text-xl"></i>
                </button>
                <ul tabindex="-1" role="menu" class="dropdown-content z-[100] menu p-2 shadow-2xl bg-base-100 rounded-box w-52 border border-base-200 mt-2 gap-1">
                    <li>
                        <a href="/{data.item?.id}/edit" class="font-medium text-base-content hover:text-primary">
                            <i class="bi bi-pencil-square text-lg opacity-70"></i> Edit
                        </a>
                    </li>
                    <!--
                    {#if activeSchema.length > 0}
                        <li>
                            <button type="button" class="font-medium text-base-content hover:text-primary justify-between" on:click={() => attrModal.showModal()}>
                                <span class="flex items-center gap-2"><i class="bi bi-ui-checks-grid text-lg opacity-70"></i> Attributes</span>
                            </button>
                        </li>
                    {/if}
                    -->
                    <li>
                        <a href="https://www.google.com/search?q={encodeURIComponent(data.item?.title)}" target="_blank" rel="noopener noreferrer" class="font-medium text-base-content hover:text-primary">
                            <i class="bi bi-google text-lg opacity-70"></i> Search
                        </a>
                    </li>
                    <li>
                        <button type="button" class="font-medium text-info hover:text-info" on:click={() => diagnosticModal.showModal()}>
                            <i class="bi bi-clipboard-data text-lg opacity-70"></i> Diagnostic Dump
                        </button>
                    </li>
                    {#if dev}
                    <li>
                        <button type="button" class="font-medium text-warning hover:text-warning" on:click={() => devDebugModal.showModal()}>
                            <i class="bi bi-bug-fill text-lg opacity-70"></i> Debug Match
                        </button>
                    </li>
                    {/if}
                    <li class="divider my-0 h-[1px] bg-base-200"></li>
                    <li>
                        <div class="p-0 hover:bg-transparent block">
                            <!-- CSS injects the word "Delete" so we don't have to break the Delete component's isolation -->
                            <Delete message='Delete this item?' action='/{data.item?.id}/delete' btnClass="menu-delete-btn btn btn-ghost w-full justify-start hover:bg-error/10 hover:text-error px-4 py-2 h-auto min-h-0 rounded-lg font-medium" iconClass="bi bi-trash text-lg opacity-70" />
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    </div>

    {#if data.duplicateItemDetails}
        <div class="mb-6 animate-fade-in max-w-2xl mx-auto">
            <DuplicateResolution 
                scannedTitle={data.item.title} 
                matchDetails={data.duplicateItemDetails} 
                scannedCreatedAt={String(data.item.createdAt)}
                isAfterTheFact={true}
                    scannedItem={data.item}
                on:resolve={(e) => {
                    if (e.detail === 'merge') (document.getElementById('mergeForm') as HTMLFormElement)?.requestSubmit();
                    else if (e.detail === 'new') (document.getElementById('dismissForm') as HTMLFormElement)?.requestSubmit();
                    else if (e.detail === 'ignore') {
                        duplicateDeleteModal.showModal();
                    }
                }}
                    on:zoom={(e) => lightbox.open({ orgPath: e.detail.orgPath || e.detail.thumbPath, showOriginal: true })}
            />
            <form id="mergeForm" method="POST" action="?/mergeDuplicate" class="hidden" use:enhance>
                <input type="hidden" name="targetId" value={data.duplicateItemDetails.id}>
            </form>
            <form id="dismissForm" method="POST" action="?/dismissDuplicate" class="hidden" use:enhance={() => {
                return async ({ update }) => {
                    data.duplicateItemDetails = null;
                    await update({ reset: false });
                };
            }}></form>
            <Delete bind:this={duplicateDeleteModal} action="?/deleteDuplicate" message="Are you sure you want to vaporize this anomaly? This cannot be undone." btnClass="hidden" />
        </div>
    {/if}

    <!-- End-User Processing Indicator -->
    {#if isProcessingItem}
        <div class="alert bg-base-200/50 border border-base-300 shadow-sm mb-6 rounded-xl flex items-start gap-3 animate-fade-in">
            <span class="loading loading-spinner text-primary mt-0.5"></span>
            <div>
                <h3 class="font-bold text-sm">Processing background tasks ({data.activeTasks.length})&hellip;</h3>
                <ul class="text-xs text-gray-500 mt-0.5 list-disc list-inside ml-1">
                    {#each data.activeTasks as task}
                        <li class="line-clamp-1">{task.description}</li>
                    {/each}
                </ul>
            </div>
        </div>
    {/if}

    {#if !isProcessingItem && data.item?.photos?.some(p => !p.thumbPath && p.orgPath)}
        <div class="alert bg-warning/20 border border-warning shadow-sm mb-6 rounded-xl flex items-start gap-3 animate-fade-in">
            <i class="bi bi-exclamation-triangle text-warning mt-0.5"></i>
            <div class="flex-1">
                <h3 class="font-bold text-sm">Processing Stalled</h3>
                <p class="text-xs text-gray-500 mt-0.5">Background tasks for this item were interrupted (e.g., server restart).</p>
            </div>
            <form method="POST" action="?/retryProcessing" use:enhance><button class="btn btn-warning btn-sm shadow-sm">Retry Now</button></form>
        </div>
    {/if}

    <!-- flex flex-row -->
    <div class="flex flex-col md:flex-row w-full gap-6 md:gap-4 mb-6">
        <div class="w-full md:w-2/3 pl-2">
            {#if productPhotos?.length > 0}
                <div class="carousel carousel-center w-full max-w-md p-4 space-x-4 rounded-box max-h-80 bg-base-200 shadow-inner border border-base-300/50">
                    {#each productPhotos as photo, i}
                        <div id="carousel-item{i}" class="carousel-item w-full justify-center cursor-zoom-in relative group rounded-2xl overflow-hidden bg-base-100 shadow-sm border border-base-200/60">
                            {#if productPhotos[i].cropPath}
                               <form method="POST" action="?/toggleBackground" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); } }} class="absolute top-2 right-2 z-30 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <input type="hidden" name="photoId" value={productPhotos[i].id} />
                                    <input type="hidden" name="showOriginal" value={productPhotos[i].showOriginal ? 'false' : 'true'} />
                                   <button type="submit" class="btn btn-circle btn-sm btn-ghost bg-base-100/80 shadow-md backdrop-blur-sm" title={productPhotos[i].showOriginal ? "Show Cutout" : "Show Original"}>
                                       <i class="bi {productPhotos[i].showOriginal ? 'bi-scissors' : 'bi-image'} text-lg"></i>
                                    </button>
                                </form>                            

                                {@const cols = productPhotos[i].colors?.length > 2 ? Object.keys(JSON.parse(productPhotos[i].colors)) : []}
                                <button type="button" class="p-0 border-none bg-transparent h-full w-full flex justify-center items-center relative overflow-hidden" on:click={() => lightbox.open(productPhotos[i])}>
                                    {#if cols.length > 0}
                                        <!-- Ambient Dynamic Lighting Effect -->
                                        <div class="absolute inset-0 opacity-20 dark:opacity-30 mix-blend-screen pointer-events-none transition-opacity duration-500 group-hover:opacity-40" style="background: radial-gradient(circle at 20% 20%, {cols[0]}, transparent 60%), radial-gradient(circle at 80% 80%, {cols[1] || cols[0]}, transparent 60%);"></div>
                                    {/if}
                                    {#if productPhotos[i].orgPath.match(/\.(mp4|webm|mov|ogg|mkv)$/i)}
                                        <video src="{productPhotos[i].orgPath}#t=0.1" class="object-scale-down max-h-full max-w-full rounded-xl relative z-10" muted playsinline></video>
                                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20 rounded-xl z-20">
                                            <i class="bi bi-play-circle-fill text-5xl text-white drop-shadow-md"></i>
                                        </div>
                                    {:else}
                                        {@const cb = productPhotos[i].updatedAt ? '?v=' + new Date(productPhotos[i].updatedAt).getTime() : ''}
                                        <img src="{(productPhotos[i].showOriginal ? productPhotos[i].orgPath : productPhotos[i].cropPath) + cb}" alt="{productPhotos[i].llmAnalysis ? JSON.parse(productPhotos[i].llmAnalysis).description : data.item.title}" class="object-scale-down max-h-full max-w-full relative z-10 drop-shadow-2xl">
                                    {/if}
                                </button>

                                <!-- Photo Import Date Overlay -->
                                <div class="absolute bottom-2 left-2 bg-base-100/80 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                    <span class="text-[10px] font-medium text-base-content/80"><RelativeDate date={productPhotos[i].createdAt} /></span>
                                </div>

                            {:else}
                                {@const cols = productPhotos[i].colors?.length > 2 ? Object.keys(JSON.parse(productPhotos[i].colors)) : []}
                                <button type="button" class="p-0 border-none bg-transparent h-full w-full flex justify-center items-center relative overflow-hidden" on:click={() => lightbox.open(productPhotos[i])}>
                                    {#if cols.length > 0}
                                        <div class="absolute inset-0 opacity-20 dark:opacity-30 mix-blend-screen pointer-events-none transition-opacity duration-500 group-hover:opacity-40" style="background: radial-gradient(circle at 20% 20%, {cols[0]}, transparent 60%), radial-gradient(circle at 80% 80%, {cols[1] || cols[0]}, transparent 60%);"></div>
                                    {/if}
                                    {#if productPhotos[i].orgPath.match(/\.(mp4|webm|mov|ogg|mkv)$/i)}
                                        <video src="{productPhotos[i].orgPath}#t=0.1" class="object-scale-down max-h-full max-w-full rounded-xl relative z-10" muted playsinline></video>
                                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20 rounded-xl z-20">
                                            <i class="bi bi-play-circle-fill text-5xl text-white drop-shadow-md"></i>
                                        </div>
                                    {:else}
                                        <img src="{productPhotos[i].orgPath}" alt="{data.item?.title}" class="object-scale-down max-h-full max-w-full relative z-10 drop-shadow-2xl">
                                    {/if}
                                </button>

                                <!-- Photo Import Date Overlay -->
                                <div class="absolute bottom-2 left-2 bg-base-100/80 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                    <span class="text-[10px] font-medium text-base-content/80"><RelativeDate date={productPhotos[i].createdAt} /></span>
                                </div>
                            {/if}
                        </div> 
                    {/each}
                </div>
                <div class="flex justify-start w-full py-2 gap-2 overflow-x-auto hide-scrollbar">
                    {#each productPhotos as photo, i}
                        {@const cols = photo.colors?.length > 2 ? Object.keys(JSON.parse(photo.colors)) : []}
                        <button aria-label="View photo {i + 1}" on:click={()=> { document.getElementById("carousel-item" + i).scrollIntoView({ block: 'nearest', inline: 'center' }) }} class="btn shrink-0 p-0 overflow-hidden relative border border-base-300 bg-base-100 hover:border-primary transition-colors">
                            {#if cols.length > 0}
                                <div class="absolute inset-0 opacity-20 pointer-events-none" style="background: linear-gradient(135deg, {cols[0]}, {cols[1] || cols[0]});"></div>
                            {/if}
                            {#if photo.orgPath.match(/\.(mp4|webm|mov|ogg|mkv)$/i)}
                                <video class="object-cover w-12 h-12 bg-black rounded relative z-10" src="{photo.orgPath}#t=0.1" muted playsinline></video>
                            {:else}
                                <img class="object-scale-down w-12 h-12 bg-transparent relative z-10" src="{(photo.showOriginal ? photo.orgPath?.replace(/\.[^/.]+(?=\?|$)/, '_org_thumb.webp') : photo.thumbPath)}{photo.updatedAt ? '?v=' + new Date(photo.updatedAt).getTime() : ''}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = photo.thumbPath || photo.orgPath || ''; } }} alt="Thumbnail {i + 1}"/>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="w-full md:w-1/3 flex flex-col gap-4">
            
            <!-- MOBILE ONLY: Compact Side-by-Side Row -->
            <div class="md:hidden bg-base-100 shadow-sm border border-base-200 rounded-xl p-3 flex flex-col gap-3">
                <div class="flex items-center gap-3">
                    <!-- Stock Box -->
                    <div class="flex flex-col justify-center bg-base-200/60 px-3 py-2 rounded-xl text-center shrink-0 min-w-[4.5rem]">
                        <div class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Stock</div>
                        <div class="text-2xl font-bold leading-tight">{data.item.amount !== null ? data.item.amount : '-'}</div>
                    </div>

                    <!-- Container (First location) -->
                    {#if data.item.locations?.[0]}
                        {@const loc = data.item.locations[0]}
                        <div class="flex items-center gap-3 flex-1 min-w-0">
                            <div class="w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-base-200 bg-base-50 flex items-center justify-center">
                                {#if loc.container.parent?.photoPath}
                                    <img class="w-full h-full object-cover" src="{loc.container.parent.photoPath.replace(/\.[^/.]+$/, '_thumb.webp')}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = loc.container.parent.photoPath; } }} alt="Parent container"/>
                                {:else if loc.container?.photoPath}
                                    <img class="w-full h-full object-cover" src="{loc.container.photoPath.replace(/\.[^/.]+$/, '_thumb.webp')}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = loc.container.photoPath; } }} alt="Container thumbnail"/>
                                {:else}
                                    <i class="bi bi-box-seam text-2xl text-gray-400"></i>
                                {/if}
                            </div>
                            <div class="flex flex-col justify-center min-w-0">
                                <div class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold leading-none mb-0.5">Location</div>
								<a href="/container/{encodeURIComponent(loc.container.name)}" class="font-bold text-sm leading-tight truncate hover:text-primary hover:underline">
									{loc.container.name}
								</a>
                                <div class="text-xs text-gray-500 leading-snug line-clamp-1 mt-0.5">{loc.container?.parent?.description || loc.container?.description || 'No description'}</div>
                            </div>
                        </div>
                    {/if}
                </div>

                {#if data.item.locations.length > 1 || data.item.reason}
                    <div class="divider m-0 h-0"></div>
                    <div class="flex flex-col gap-1.5 text-xs">
                        {#if data.item.reason}
                            <div><span class="font-semibold text-gray-500 uppercase">Reason:</span> {data.item.reason}</div>
                        {/if}
                        {#if data.item.locations.length > 1}
                            <div class="text-gray-500 font-semibold uppercase text-[10px] mt-0.5">Other Locations:</div>
                            <div class="flex flex-wrap gap-1">
                                {#each data.item.locations.slice(1) as loc}
									<a href="/container/{encodeURIComponent(loc.container.name)}" class="badge badge-ghost badge-sm hover:border-primary hover:text-primary transition-colors">
										{loc.container.name}
									</a>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>


            <!-- DESKTOP ONLY: Original Stacked Layout -->
            <div class="hidden md:flex flex-col gap-4">
                <div class="stats shadow w-full">
                    <div class="stat">
                        <div class="stat-figure text-secondary">
                        </div>
                        <div class="stat-title">
                            <span class="text-xs">Stock</span>
                        </div>
                        <div class="stat-value text-secondary">
                            {#if data.item.amount !== null}
                                {data.item.amount}
                            {/if}
                        </div>
                        <div class="stat-desc">&nbsp;</div>
                    </div>
                </div>

                {#each data.item.locations as loc, i}
                    <div class="card bg-base-100 shadow-sm border border-base-200 w-full overflow-hidden">
                        {#if i === 0}
                            <figure class="w-full h-20 border-b border-base-200 bg-base-200 m-0">
                                {#if loc.container.parent?.photoPath}
                                    <img class="w-full h-full object-cover object-top" src="{loc.container.parent.photoPath.replace(/\.[^/.]+$/, '_thumb.webp')}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = loc.container.parent.photoPath; } }} alt="Parent container"/>
                                {:else if loc.container?.photoPath}
                                    <img class="w-full h-full object-cover object-top" src="{loc.container.photoPath.replace(/\.[^/.]+$/, '_thumb.webp')}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = loc.container.photoPath; } }} alt="Container thumbnail"/>
                                {:else}
                                    <div class="w-full h-full flex items-center justify-center">
                                        <i class="bi bi-box-seam text-4xl text-gray-400"></i>
                                    </div>
                                {/if}
                            </figure>
                        {/if}
                            <div class="card-body p-4 gap-1 relative">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Location {i > 0 ? `#${i+1}` : ''}</div>
                                        <a href="/container/{encodeURIComponent(loc.container.name)}" class="card-title text-lg m-0 hover:text-primary hover:underline w-max">
                                            {loc.container.name}
                                        </a>
                                    </div>
                                    <button class="btn btn-sm btn-outline border-base-300 rounded-xl hover:border-primary text-xs" on:click={() => openMoveModal()}>
                                        <i class="bi bi-arrows-move"></i> Move it
                                    </button>
                                </div>
                                <p class="text-sm text-gray-600 m-0">{loc.container?.parent?.description || loc.container?.description || 'No description'}</p>
                            </div>
                    </div>
                {/each}

                {#if data.item.reason}
                    <div class="mb-3 text-sm">
                        Reason: {data.item.reason}<br/>
                    </div>
                {/if}
            </div>

			<!-- Tags & Categories -->
			{#if (data.item?.tags && data.item.tags.length > 0) || itemCategories.length > 0}
                <div class="flex flex-wrap justify-start gap-2 mt-1">
					{#each itemCategories as cat}
						<div class="badge badge-primary badge-outline badge-sm shadow-sm">
							<a href="/search?category={encodeURIComponent(cat)}">{cat}</a>
						</div>
					{/each}
                    {#each data.item?.tags as tag}
						<div class="badge badge-ghost badge-sm hover:border-primary hover:text-primary transition-colors">
                            <a href="/tag/{tag.slug}">{tag.name}</a>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    {#if data.item?.contentToHtml?.length > 0}
        <div class="content prose max-w-none mb-3">
            {@html data.item?.contentToHtml}
        </div>
    {/if}

    {#if data.item.attributes.length > 0 || photoAttributes.length > 0}
        <div class="bg-base-100 rounded-3xl border border-base-200 shadow-sm p-4 sm:p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
                <div class="font-bold text-lg flex items-center gap-2">
                    <i class="bi bi-list-columns-reverse text-primary"></i> Attributes
                </div>
                {#if activeSchema.length > 0}
                    <button type="button" class="btn btn-xs btn-ghost text-primary gap-1" on:click={() => attrModal.showModal()}>
                        <i class="bi bi-pencil-square"></i> Quick Tweak
                    </button>
                {/if}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                    {#each data.item.attributes as attrib}
                        {@const schemaField = activeSchema.find(f => f.name === attrib.key)}
                        {@const displayKey = attrib.key === 'color_mix' ? 'Colors' : (schemaField?.uiLabel || attrib.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}
                        {@const displayVal = (() => {
                            const normalizedAttr = attrib.value.replace(/_/g, ' ').toLowerCase();
                            if (schemaField?.options) {
                                const optMatch = schemaField.options.find(o => o.toLowerCase().replace(/_/g, ' ') === normalizedAttr);
                                if (optMatch) return optMatch;
                            }
                            // Fallback: If it's a legacy snake_case value, format it cleanly anyway
                            if (attrib.value.includes('_')) {
                                return attrib.value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                            }
                            return attrib.value;
                        })()}
                        <div class="flex flex-col sm:flex-row sm:justify-between py-2 border-b border-base-200/50 last:border-0">
                            <span class="text-sm text-gray-500 font-medium">{displayKey}</span>
                            {#if attrib.key === 'color_mix'}
                                <div class="sm:w-1/2 mt-1 sm:mt-0"><ColorMixBar colorMixStr={attrib.value} /></div>
                            {:else if attrib.value.startsWith('/images/')}
                                <button type="button" class="text-sm font-bold text-primary hover:underline break-all text-left sm:text-right line-clamp-1" on:click={() => lightbox.open({ orgPath: attrib.value, showOriginal: true })}>
                                    {attrib.value}
                                </button>
                            {:else}
                                <span class="text-sm font-bold text-base-content break-words text-left sm:text-right">{displayVal}</span>
                            {/if}
                        </div>
                    {/each}
                </div>
                {#if photoAttributes.length > 0}
                    <div class="flex flex-col gap-2 bg-base-200/40 p-4 rounded-2xl border border-base-200">
                        <div class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
                            <i class="bi bi-upc-scan"></i> Detected Text (OCR)
                        </div>
                        <div class="flex flex-wrap gap-2">
                            {#each photoAttributes as attrib}
                                <span class="badge badge-ghost text-xs py-3 font-mono opacity-80 border-base-300 shadow-sm">{attrib.value}</span>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    {#if productPhotos.some(p => p.exifData)}
        <div class="border-b border-base-300 pb-3 mb-3">
            <div class="title font-bold mb-3 flex items-center gap-2">
                <i class="bi bi-camera"></i> EXIF & Image Data
            </div>
            <div class="flex flex-col gap-2 mt-2">
                {#each productPhotos.filter(p => p.exifData) as photo}
                    {@const exif = JSON.parse(photo.exifData)}
                    <div class="bg-base-200/50 p-3 rounded-xl border border-base-200 text-xs font-mono break-all max-h-48 overflow-y-auto">
                        {#if exif.gps && exif.gps.GPSLatitude && exif.gps.GPSLongitude}
                            <div class="text-primary font-bold mb-2">GPS Location Found</div>
                            <div class="mb-2 text-gray-500">
                                Lat: {exif.gps.GPSLatitude.join(', ')} {exif.gps.GPSLatitudeRef} <br/>
                                Lon: {exif.gps.GPSLongitude.join(', ')} {exif.gps.GPSLongitudeRef}
                            </div>
                        {/if}
                        {#if exif.image?.Make || exif.image?.Model}
                            <div class="mb-2 text-gray-500">
                                Camera: {exif.image?.Make} {exif.image?.Model}
                            </div>
                        {/if}
                        <details>
                            <summary class="cursor-pointer text-gray-400 font-bold">View Raw EXIF JSON</summary>
                            <pre class="mt-2 text-[10px] bg-base-300 p-2 rounded-lg">{JSON.stringify(exif, null, 2)}</pre>
                        </details>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <div class="border-b border-base-300 pb-3 mb-3">
        {#if otherPhotos.length > 0}
            <div class="title font-bold  mb-3">
                More information
            </div>

            <div class="mb-3 flex flex-wrap gap-3">
                {#each otherPhotos as photo}
                    <button type="button" class="p-0 border-none bg-transparent" on:click={() => lightbox.open(photo)}>
                        <img 
                            src="{photo.thumbPath || photo.orgPath}"
                            alt="Additional detail view"
                            class="w-32 h-32 object-cover rounded-lg shadow-sm cursor-zoom-in">
                    </button>
                {/each}
            </div>
        {/if}

        <!-- ASSISTANT -->
        <div class="title font-bold mb-3 flex items-center gap-2">
            <i class="bi bi-robot text-primary"></i> Ask itemLens
        </div>
        <div class="mb-6 bg-base-200/50 p-4 rounded-2xl border border-base-200">
            <p class="text-xs text-gray-500 mb-3">Ask questions about this item based on its photos, OCR text, and downloaded manuals.</p>
            <div class="flex gap-2 relative">
                <div class="relative w-full flex items-center">
                    <input type="text" bind:value={aiQuestion} placeholder="e.g. What kind of batteries does this take?" class="input input-sm input-bordered w-full rounded-xl pr-20 {productPhotos.length > 0 ? 'pl-24' : 'pl-4'}" on:keydown={(e) => e.key === 'Enter' && askAiQuestion()} disabled={isAskingAi} />
                    
                    {#if productPhotos.length > 0}
                        <button 
                            type="button" 
                            class="absolute left-2 top-1/2 -translate-y-1/2 badge badge-sm gap-1.5 transition-all cursor-pointer font-medium {includePhotoContext ? 'badge-primary shadow-sm' : 'badge-ghost text-gray-400 border-base-300'}" 
                            on:click={() => includePhotoContext = !includePhotoContext}
                            title={includePhotoContext ? "Click to exclude photo context" : "Click to include photo context"}
                        ><i class="bi bi-image"></i> <span>Photo</span></button>
                    {/if}
                </div>
                <button type="button" class="btn btn-sm btn-primary absolute right-0 top-0 rounded-l-none rounded-r-xl" on:click={askAiQuestion} disabled={isAskingAi || !aiQuestion.trim()}>
                    {#if isAskingAi}
                        <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                        Ask
                    {/if}
                </button>
            </div>
        </div>

        <div class="title font-bold  mb-3">
            Local archive
        </div>

        <div role="tablist" class="tabs  tabs-bordered w-full">
            {#each data.item.documents as doc,i}
                <div class="collapse collapse-arrow bg-base-200 mb-1">
                    <input type="radio" name="my-accordion-2" checked={i===0} />
                    <div class="collapse-title font-semibold bg-base-300">
                        {doc.title}
                    </div>
                    <div class="collapse-content prose prose-sm max-w-none"> 
                        {@html alterSummary(doc.summary)}
    
                        <div class="flex justify-between items-center mt-2">
                            <div class="flex justify-start items-center gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                                
                                {#if doc.path.toLowerCase().endsWith('.epub')}
                                    <button type="button" class="btn btn-sm btn-primary rounded-xl" on:click={() => docLightbox.open(doc)}>
                                        <i class="bi bi-book"></i> Read Book
                                    </button>
                                {:else if doc.path.toLowerCase().match(/\.(md|txt)$/i) || doc.type === 'note'}
                                    <button type="button" class="btn btn-sm btn-secondary rounded-xl shadow-sm" on:click={() => docLightbox.open(doc)}>
                                        <i class="bi bi-file-text"></i> Read Note
                                    </button>
                                {:else if doc.path.toLowerCase().match(/\.(pdf|html|htm)$/i)}
                                    <button type="button" class="btn btn-sm btn-outline border-base-300 rounded-xl bg-base-100 shadow-sm hover:border-primary" on:click={() => docLightbox.open(doc)}>
                                        <i class="bi bi-file-earmark"></i> View Document
                                    </button>
                                {:else}
                                    <a href="{doc.path}" target="_blank" class="truncate max-w-[200px] sm:max-w-full block text-primary hover:underline font-medium" title="{doc.source}">
                                        {doc.source}
                                    </a>
                                {/if}
                            </div>

                            <form method="POST" action="?/deleteDocument" use:enhance={() => { return async ({ update }) => { await update(); notify('success', 'Document deleted.'); }; }}>
                                <input type="hidden" name="docId" value={doc.id}>
                                <button type="button" class="btn btn-sm btn-ghost text-error hover:bg-error/10 rounded-xl" title="Delete Document" on:click={async (e) => { const form = e.currentTarget.closest('form'); const res = await confirmModal.ask('Delete Document?', `Are you sure you want to permanently delete "${doc.title}"?`, 'Delete', 'Cancel', true); if (res) form.requestSubmit(); }}>
                                    <i class="bi bi-trash3"></i>
                                </button>
                            </form>
                        </div>
    
                    </div>
                </div>
            {/each}
       </div>
    </div>
    
    {#if invoicePhotos.length > 0}
        <div class="border-b border-base-300 pb-3 mb-3">
            <div class="title font-bold mb-3">
                Purchase Information
            </div>

            <div class="flex flex-col gap-4 w-full">
                {#each invoicePhotos as photo}
                    <InvoiceViewer {photo} onOpenLightbox={() => lightbox.open(photo)} />
                {/each}
            </div>
        </div>
    {/if}

    <div class="border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">
            Colors in product photos
        </div>
        <div class="flex flex-wrap gap-2 mt-2">
            {#each productPhotos as photo}
                {#if photo.colors?.length > 2}
                    {@const cols=Object.keys(JSON.parse(photo.colors))}
                    {@const names=Object.values(JSON.parse(photo.colors))}
                    {#each cols as col, i}
                        <div class="tooltip shadow text-xs items-center text-center rounded" data-tip="{names[i]} ({col})">
                            <div class="w-8 h-8 rounded border border-base-200/50" style="background-color:{col}">
                            </div>
                        </div>
                    {/each}
                {/if}
            {/each}
        </div>
    </div>

    <!-- Background Activity Log -->
    {#if dev}
        <div class="border-b border-base-300 pb-3 mb-3 animate-fade-in">
            <div class="title font-bold mb-3 flex items-center justify-between">
                <span>Activity Log</span>
            </div>
            <div class="bg-base-200/50 rounded-xl max-h-64 overflow-y-auto p-4 font-mono text-xs border border-base-200 shadow-inner">
                {#if data.item?.logs?.length > 0}
                    <ul class="space-y-2">
                        {#each data.item.logs as log}
                            <li class="flex items-start gap-3 border-b border-base-300/50 pb-2 last:border-0 last:pb-0">
                                <span class="text-gray-400 shrink-0 w-16">
                                    {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span class="font-bold shrink-0 w-24 truncate 
                                    {log.level === 'success' ? 'text-success' : log.level === 'warning' ? 'text-warning' : log.level === 'error' ? 'text-error' : 'text-info'}">
                                    [{log.action}]
                                </span>
                                <span class="text-gray-600 break-words flex-1">
                                    {log.message}
                                    {#if log.payload}
                                        <button type="button" class="btn btn-xs btn-outline btn-ghost ml-2 py-0 h-5 min-h-0 text-[10px]" on:click={() => openPayloadModal(log)}>View Details</button>
                                    {/if}
                                </span>
                            </li>
                        {/each}
                    </ul>
                {:else}
                    <div class="text-gray-400 italic">No background activity recorded.</div>
                {/if}
            </div>
        </div>
    {/if}
</article>

<form method="POST" action="?/saveAttributes" id="saveAttrsForm" use:enhance={() => {
    return async ({ update }) => { attrModal.close(); await update(); };
}}>
    <input type="hidden" name="attributes" id="attrsInput" />
</form>

<dialog bind:this={payloadModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box p-0 overflow-hidden bg-base-100 shadow-2xl border border-base-200 sm:rounded-[2.5rem] w-11/12 max-w-5xl flex flex-col max-h-[90vh]">
        <div class="p-6 pb-4 border-b border-base-200 bg-base-100/90 sticky top-0 z-10 flex justify-between items-center">
            <h3 class="font-bold text-lg leading-tight">{payloadModalTitle}</h3>
            <button class="btn btn-sm btn-circle btn-ghost" on:click={() => payloadModal.close()}><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="p-4 overflow-y-auto bg-base-200/50">
            <pre class="text-[10px] font-mono whitespace-pre-wrap break-words">{payloadModalContent}</pre>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<dialog bind:this={attrModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box p-0 overflow-hidden bg-base-100 shadow-2xl border border-base-200 sm:rounded-[2.5rem]">
        <CompareAttributeSheet item={{...data.item, extractedAttributes: itemAttributes}} {activeSchema} showAll={true} on:cancel={() => attrModal.close()} on:save={(e) => { (document.getElementById('attrsInput') as HTMLInputElement).value = JSON.stringify(e.detail.attributes); (document.getElementById('saveAttrsForm') as HTMLFormElement).requestSubmit(); }} />
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<dialog bind:this={diagnosticModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box bg-base-100 shadow-2xl border border-info/50">
        <h3 class="font-bold text-lg mb-4 text-info"><i class="bi bi-clipboard-data"></i> Item Diagnostics</h3>
        <p class="text-xs mb-2">Copy this payload for debugging pending states.</p>
        <textarea class="textarea textarea-bordered w-full h-64 text-[10px] font-mono" readonly>{JSON.stringify({ photos: data.item?.photos, tasks: data.activeTasks }, null, 2)}</textarea>
        <div class="modal-action">
            <button class="btn" on:click={() => diagnosticModal.close()}>Close</button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<ImageLightbox bind:this={lightbox} itemTitle={data.item?.title} categories={data.categories} allowCategoryEdit={true} />
<DocumentLightbox bind:this={docLightbox} />

{#if dev}
<dialog bind:this={devDebugModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box bg-base-100 shadow-2xl border border-warning/50">
        <h3 class="font-bold text-lg mb-4 text-warning"><i class="bi bi-bug-fill"></i> Force Match Debugger</h3>
        <div class="form-control mb-4">
            <button type="button" class="btn btn-outline border-base-300 justify-start h-auto py-3 px-4 rounded-xl font-normal text-left" on:click={() => selectorModal.showModal()}>
                {#if selectedTargetItem}
                    <span class="font-bold">{selectedTargetItem.title}</span>
                {:else}
                    <span class="text-gray-400">Choose item to compare against...</span>
                {/if}
            </button>
        </div>
        <button class="btn btn-warning w-full" on:click={runDevDebug} disabled={isDevDebugging || !selectedTargetItem}>
            {#if isDevDebugging}<span class="loading loading-spinner"></span>{/if} Compare
        </button>
        
        {#if devDebugResult?.match}
            <div class="mt-4 p-4 bg-base-200 rounded-xl text-xs font-mono overflow-auto max-h-64 border border-base-300">
                <div class="font-bold mb-2 pb-2 border-b border-base-300">Score: <span class={devDebugResult.match.isMatch ? 'text-success' : 'text-error'}>{devDebugResult.match.score}</span> | isMatch: <span class={devDebugResult.match.isMatch ? 'text-success' : 'text-error'}>{devDebugResult.match.isMatch}</span></div>
                {#each devDebugResult.match.debugTrace as trace}
                    <div class="mb-1 py-0.5 border-b border-base-300/30 last:border-0">{trace}</div>
                {/each}
            </div>
        {/if}
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<ItemSelectorModal bind:this={selectorModal} title="Compare Debugger" subtitle="Browse or search all items (newest first)" on:select={(e) => {
    selectedTargetItem = e.detail;
    runDevDebug();
}} />
{/if}

<dialog bind:this={moveModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box p-4 bg-base-100 shadow-2xl border border-base-200 sm:rounded-[2.5rem]">
        <h3 class="font-bold text-xl mb-1 flex items-center gap-2"><i class="bi bi-arrows-move text-primary"></i> Move Item</h3>
        <p class="text-xs text-gray-500 mb-4">Select the new container for this item.</p>
        {#if isLoadingContainers}
            <div class="flex justify-center p-8"><span class="loading loading-spinner text-primary"></span></div>
        {:else}
            <ContainerSelector 
                containers={globalContainers} 
                defaultTab="select" 
                on:change={(e) => { if (e.detail.containers.length > 0) quickMove(e.detail.containers[0]); }} 
            />
        {/if}
    </div>
    <form method="dialog" class="modal-backdrop"><button disabled={isMoving}>close</button></form>
</dialog>

<ConfirmModal bind:this={confirmModal} />

<style>
    :global(.menu-delete-btn::after) {
        content: "Delete";
        margin-left: 0.75rem;
    }
</style>
