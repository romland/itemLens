<script lang="ts">
    import type { PageServerData } from "./$types";
    import Delete from "$lib/components/delete.svelte";
    import { toTextDocument, refine, refineForLLM } from "$lib/shared/ocrparser";
    import { afterNavigate, beforeNavigate } from '$app/navigation'
    import { marked } from "marked";
    import { enhance } from "$app/forms";
    import PasteHandler from "$lib/components/PasteHandler.svelte";
    import ImageLightbox from "$lib/components/ImageLightbox.svelte";
    import InvoiceViewer from "$lib/components/InvoiceViewer.svelte";
    import DuplicateResolution from "$lib/components/DuplicateResolution.svelte";
    import CompareAttributeSheet from "$lib/components/compare/CompareAttributeSheet.svelte";
    import RelativeDate from "$lib/components/RelativeDate.svelte";
    import ColorMixBar from "$lib/components/ColorMixBar.svelte";

    export let data: PageServerData;
    
    let productPhotos = [], invoicePhotos = [], otherPhotos = [];
    let photoAttributes = [];
    let isSavingPasted = false;
    let lightbox: ImageLightbox;
    let isProcessingItem = false;
    let attrModal: HTMLDialogElement;

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
    formId="pasteForm"
    on:success={() => (document.getElementById('pasteForm') as HTMLFormElement)?.requestSubmit()}
    on:processingComplete={() => {}}
/>

<form id="pasteForm" action="?/addPasted" method="POST" class="hidden" enctype="multipart/form-data" use:enhance={() => {
    isSavingPasted = true;
    return async ({ update }) => {
        await update({ reset: true });
        isSavingPasted = false;
        
        // Cleanup dynamically appended hidden inputs to prevent ghost re-submissions
        document.querySelectorAll('#pasteForm input[name^="pasted_"], #pasteForm input[name^="preprocessed_"]').forEach(el => el.remove());
    };
}}></form>

<article style="padding-bottom: 100px;" class="">

    <div class="flex justify-between items-start gap-4 border-b border-base-200/60 pb-3 mb-4 mt-2">
        <div class="flex flex-col flex-1">
            <h1 class="text-3xl sm:text-4xl font-bold text-base-content break-words leading-tight tracking-tight">
                {data.item?.title}
            </h1>
            <div class="text-[11px] text-gray-500 font-medium flex items-center gap-1.5 mt-2">
                <i class="bi bi-clock-history opacity-70"></i> Added <RelativeDate date={data.item?.createdAt} />
                {#if data.item?.updatedAt && data.item.updatedAt !== data.item.createdAt}
                    <span class="mx-1 opacity-40">•</span> <i class="bi bi-pencil opacity-70"></i> Updated <RelativeDate date={data.item.updatedAt} />
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
                            <i class="bi bi-pencil-square text-lg opacity-70"></i> Modify
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
                scannedCreatedAt={data.item.createdAt}
                isAfterTheFact={true}
                    scannedItem={data.item}
                on:resolve={(e) => {
                    if (e.detail === 'merge') (document.getElementById('mergeForm') as HTMLFormElement)?.requestSubmit();
                    else if (e.detail === 'new') (document.getElementById('dismissForm') as HTMLFormElement)?.requestSubmit();
                    else if (e.detail === 'ignore') {
                        if (confirm('Are you sure you want to vaporize this anomaly? This cannot be undone.')) (document.getElementById('deleteDuplicateForm') as HTMLFormElement)?.requestSubmit();
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
            <form id="deleteDuplicateForm" method="POST" action="?/deleteDuplicate" class="hidden" use:enhance></form>
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

    <!-- flex flex-row -->
    <div class="flex flex-col md:flex-row w-full gap-6 md:gap-4 mb-6">
        <div class="w-full md:w-2/3 pl-2">
            {#if productPhotos?.length > 0}
                <div class="carousel carousel-center w-full max-w-md p-4 space-x-4 rounded-box max-h-80 bg-gradient-to-br from-primary/10 via-base-200 to-base-300 shadow-inner border border-base-300/50">
                    {#each productPhotos as photo, i}
                        <div id="carousel-item{i}" class="carousel-item w-full justify-center cursor-zoom-in relative group">
                            {#if productPhotos[i].cropPath}
                               <form method="POST" action="?/toggleBackground" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); } }} class="absolute top-2 right-2 z-10 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <input type="hidden" name="photoId" value={productPhotos[i].id} />
                                    <input type="hidden" name="showOriginal" value={productPhotos[i].showOriginal ? 'false' : 'true'} />
                                   <button type="submit" class="btn btn-circle btn-sm btn-ghost bg-base-100/80 shadow-md backdrop-blur-sm" title={productPhotos[i].showOriginal ? "Show Cutout" : "Show Original"}>
                                       <i class="bi {productPhotos[i].showOriginal ? 'bi-scissors' : 'bi-image'} text-lg"></i>
                                    </button>
                                </form>                            

                                <button type="button" class="p-0 border-none bg-transparent h-full w-full flex justify-center items-center relative" on:click={() => lightbox.open(productPhotos[i])}>
                                    {#if productPhotos[i].orgPath.match(/\.(mp4|webm|mov|ogg|mkv)$/i)}
                                        <video src="{productPhotos[i].orgPath}#t=0.1" class="object-scale-down max-h-full max-w-full rounded-xl" muted playsinline></video>
                                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20 rounded-xl">
                                            <i class="bi bi-play-circle-fill text-5xl text-white drop-shadow-md"></i>
                                        </div>
                                    {:else}
                                        <img src="{productPhotos[i].showOriginal ? productPhotos[i].orgPath : productPhotos[i].cropPath}" alt="{productPhotos[i].llmAnalysis ? JSON.parse(productPhotos[i].llmAnalysis).description : data.item.title}" class="object-scale-down max-h-full max-w-full">
                                    {/if}
                                </button>

                                <!-- Photo Import Date Overlay -->
                                <div class="absolute bottom-2 left-2 bg-base-100/80 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <span class="text-[10px] font-medium text-base-content/80"><RelativeDate date={productPhotos[i].createdAt} /></span>
                                </div>

                            {:else}
                                <button type="button" class="p-0 border-none bg-transparent h-full w-full flex justify-center items-center relative" on:click={() => lightbox.open(productPhotos[i])}>
                                    {#if productPhotos[i].orgPath.match(/\.(mp4|webm|mov|ogg|mkv)$/i)}
                                        <video src="{productPhotos[i].orgPath}#t=0.1" class="object-scale-down max-h-full max-w-full rounded-xl" muted playsinline></video>
                                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20 rounded-xl">
                                            <i class="bi bi-play-circle-fill text-5xl text-white drop-shadow-md"></i>
                                        </div>
                                    {:else}
                                        <img src="{productPhotos[i].orgPath}" alt="{data.item?.title}" class="object-scale-down max-h-full max-w-full">
                                    {/if}
                                </button>

                                <!-- Photo Import Date Overlay -->
                                <div class="absolute bottom-2 left-2 bg-base-100/80 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <span class="text-[10px] font-medium text-base-content/80"><RelativeDate date={productPhotos[i].createdAt} /></span>
                                </div>
                            {/if}
                        </div> 
                    {/each}
                </div>
                <div class="flex justify-start w-full py-2 gap-2 overflow-x-auto hide-scrollbar">
                    {#each productPhotos as photo, i}
                        <button aria-label="View photo {i + 1}" on:click={()=> { document.getElementById("carousel-item" + i).scrollIntoView({ block: 'nearest', inline: 'center' }) }} class="btn shrink-0">
                            {#if photo.orgPath.match(/\.(mp4|webm|mov|ogg|mkv)$/i)}
                                <video class="object-cover w-10 h-10 bg-black rounded" src="{photo.orgPath}#t=0.1" muted playsinline></video>
                            {:else}
                                <img class="object-scale-down w-10 h-10 bg-transparent" src="{photo.showOriginal ? photo.orgPath?.replace(/\.[^/.]+(?=\?|$)/, '_org_thumb.webp') : photo.thumbPath}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = photo.thumbPath || photo.orgPath || ''; } }} alt="Thumbnail {i + 1}"/>
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
                        <div class="card-body p-4 gap-1">
                            <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Location {i > 0 ? `#${i+1}` : ''}</div>
							<a href="/container/{encodeURIComponent(loc.container.name)}" class="card-title text-lg m-0 hover:text-primary hover:underline w-max">
								{loc.container.name}
							</a>
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
                        <div class="flex flex-col sm:flex-row sm:justify-between py-2 border-b border-base-200/50 last:border-0">
                            <span class="text-sm text-gray-500 font-medium">{attrib.key === 'color_mix' ? 'Colors' : attrib.key}</span>
                            {#if attrib.key === 'color_mix'}
                                <div class="sm:w-1/2 mt-1 sm:mt-0"><ColorMixBar colorMixStr={attrib.value} /></div>
                            {:else if attrib.value.startsWith('/images/')}
                                <button type="button" class="text-sm font-bold text-primary hover:underline break-all text-left sm:text-right" on:click={() => lightbox.open({ orgPath: attrib.value, showOriginal: true })}>
                                    {attrib.value}
                                </button>
                            {:else}
                                <span class="text-sm font-bold text-base-content break-words text-left sm:text-right">{attrib.value}</span>
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
    
                        <div class="flex justify-starts mt-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>

                            <a href="{doc.path}" target="_blank" class="truncate max-w-[200px] sm:max-w-full block" title="{doc.source}">{doc.source}</a>
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
    <div class="border-b border-base-300 pb-3 mb-3">
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
                            <span class="text-gray-600 break-words">{log.message}</span>
                        </li>
                    {/each}
                </ul>
            {:else}
                <div class="text-gray-400 italic">No background activity recorded.</div>
            {/if}
        </div>
    </div>
</article>

<form method="POST" action="?/saveAttributes" id="saveAttrsForm" use:enhance={() => {
    return async ({ update }) => { attrModal.close(); await update(); };
}}>
    <input type="hidden" name="attributes" id="attrsInput" />
</form>

<dialog bind:this={attrModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box p-0 overflow-hidden bg-base-100 shadow-2xl border border-base-200 sm:rounded-[2.5rem]">
        <CompareAttributeSheet item={{...data.item, extractedAttributes: itemAttributes}} {activeSchema} showAll={true} on:cancel={() => attrModal.close()} on:save={(e) => { document.getElementById('attrsInput').value = JSON.stringify(e.detail.attributes); document.getElementById('saveAttrsForm').requestSubmit(); }} />
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<ImageLightbox bind:this={lightbox} itemTitle={data.item?.title} categories={data.categories} allowCategoryEdit={true} />

<style>
    :global(.menu-delete-btn::after) {
        content: "Delete";
        margin-left: 0.75rem;
    }
</style>
