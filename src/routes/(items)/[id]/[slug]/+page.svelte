<script lang="ts">
    import type { PageServerData } from "./$types";
    import Delete from "$lib/components/delete.svelte";
    import { toTextDocument, refine, refineForLLM } from "$lib/shared/ocrparser";
    import { afterNavigate, beforeNavigate } from '$app/navigation'
    import { marked } from "marked";
    import { enhance } from "$app/forms";
    import PasteHandler from "$lib/components/PasteHandler.svelte";

    export let data: PageServerData;
    
    let productPhotos = [], invoicePhotos = [], otherPhotos = [];
    let photoAttributes = [];
    let currentLightboxImage = null;
    let isSavingPasted = false;
    let lightboxModal: HTMLDialogElement;
    let isProcessingItem = false;

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
        
        // Heuristic: If any photo lacks a thumbnail, or any web document lacks a downloaded path, we are still processing.
        isProcessingItem = data.item?.photos?.some(p => !p.thumbPath) || 
                           data.item?.documents?.some(d => !d.path && d.type !== 'note');

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
        const end = p.llmAnalysis.lastIndexOf("}");
        const start = p.llmAnalysis.indexOf("{");
        const json = p.llmAnalysis.slice(start, end + 1);
        console.log(json);
        console.log(
            JSON.parse(json)
        );

    }
    
    import pageTitle from '$lib/stores';
    pageTitle.set(data.item?.title);
</script>

<PasteHandler 
    formId="pasteForm"
    on:success={() => (document.getElementById('pasteForm') as HTMLFormElement)?.requestSubmit()}
    on:processingComplete={(ev) => {
        if (ev.detail.status === 'success') {
            (document.getElementById('pasteForm') as HTMLFormElement)?.requestSubmit();
        }
    }}
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

    <div class="flex justify-between items-center border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">
            {data.item?.title}
        </div>
        <div class="inline-flex gap-4 items-center">
            {#if isSavingPasted}
                <span class="loading loading-spinner loading-sm text-primary"></span>
            {/if}
            <a href="/{data.item?.id}/edit" title="Edit item" class="btn btn-circle btn-ghost bg-base-200 shadow-sm text-gray-500 hover:text-primary">
                <i class="bi bi-pencil-square text-xl"></i>
            </a>
            <Delete message='Delete this item?' action='/{data.item?.id}/delete' btnClass="btn btn-circle btn-ghost bg-base-200 shadow-sm text-gray-500 hover:text-error" iconClass="bi bi-trash text-xl" />
        </div>
    </div>

    <!-- End-User Processing Indicator -->
    {#if isProcessingItem}
        <div class="alert bg-base-200/50 border border-base-300 shadow-sm mb-6 rounded-xl flex items-start gap-3 animate-fade-in">
            <span class="loading loading-spinner text-primary mt-0.5"></span>
            <div>
                <h3 class="font-bold text-sm">Enhancing item details&hellip;</h3>
                <p class="text-xs text-gray-500 mt-0.5">We're polishing up the details in the background. Images and summaries will appear automatically once they're ready.</p>
            </div>
        </div>
    {/if}

    <!-- flex flex-row -->
    <div class="flex flex-col md:flex-row w-full gap-6 md:gap-4 mb-6">
        <div class="w-full md:w-2/3 pl-2">
            {#if productPhotos?.length > 0}
                <div class="carousel carousel-center max-w-md p-4 space-x-4 bg-neutral rounded-box max-h-80" style="background: linear-gradient(109.6deg, rgb(20, 30, 48) 11.2%, rgb(36, 59, 85) 91.1%);">
                    {#each productPhotos as photo, i}
                        <div id="carousel-item{i}" class="carousel-item w-full justify-center cursor-zoom-in relative group">
                            {#if productPhotos[i].cropPath}
                                <form method="POST" action="?/toggleBackground" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); } }} class="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <input type="hidden" name="photoId" value={productPhotos[i].id} />
                                    <input type="hidden" name="showOriginal" value={productPhotos[i].showOriginal ? 'false' : 'true'} />
                                    <button type="submit" class="btn btn-circle btn-sm btn-ghost bg-base-100/70 shadow-sm" title={productPhotos[i].showOriginal ? "Show Cutout" : "Show Original"}>
                                        <i class="bi {productPhotos[i].showOriginal ? 'bi-scissors' : 'bi-image'}"></i>
                                    </button>
                                </form>                            
                                <button type="button" class="p-0 border-none bg-transparent h-full w-full flex justify-center items-center" on:click={() => { currentLightboxImage = productPhotos[i]; lightboxModal.showModal(); }}>
                                    <img 
                                        src="{productPhotos[i].showOriginal ? productPhotos[i].orgPath : productPhotos[i].cropPath}" alt="{productPhotos[i].llmAnalysis ? JSON.parse(productPhotos[i].llmAnalysis).description : data.item.title}"
                                        class="object-scale-down max-h-full max-w-full">
                                </button>
                            {:else}
                                <button type="button" class="p-0 border-none bg-transparent h-full w-full flex justify-center items-center" on:click={() => { currentLightboxImage = productPhotos[i]; lightboxModal.showModal(); }}>
                                    <img src="{productPhotos[i].orgPath}" alt="{data.item?.title}" class="object-scale-down max-h-full max-w-full">
                                </button>
                            {/if}
                        </div> 
                    {/each}
                </div>
                <div class="flex justify-start w-full py-2 gap-1">
                    {#each productPhotos as photo, i}
                        <button aria-label="View photo {i + 1}" on:click={()=> { document.getElementById("carousel-item" + i).scrollIntoView({ block: 'nearest', inline: 'center' }) }} class="btn ">
                            <img class="object-scale-down w-10 h-10 bg-base-100" src="{photo.showOriginal ? photo.orgPath + '_org_thumb.jpg' : photo.thumbPath}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = photo.thumbPath || photo.orgPath || ''; } }} alt="Thumbnail {i + 1}"/>
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
                                    <img class="w-full h-full object-cover" src="{loc.container.parent.photoPath.replace(/\.[^/.]+$/, '_thumb.jpg')}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = loc.container.parent.photoPath; } }} alt="Parent container"/>
                                {:else if loc.container?.photoPath}
                                    <img class="w-full h-full object-cover" src="{loc.container.photoPath.replace(/\.[^/.]+$/, '_thumb.jpg')}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = loc.container.photoPath; } }} alt="Container thumbnail"/>
                                {:else}
                                    <i class="bi bi-box-seam text-2xl text-gray-400"></i>
                                {/if}
                            </div>
                            <div class="flex flex-col justify-center min-w-0">
                                <div class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold leading-none mb-0.5">Location</div>
                                <div class="font-bold text-sm leading-tight truncate">{loc.containerName}</div>
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
                                    <div class="badge badge-ghost badge-sm">{loc.containerName}</div>
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
                                    <img class="w-full h-full object-cover object-top" src="{loc.container.parent.photoPath.replace(/\.[^/.]+$/, '_thumb.jpg')}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = loc.container.parent.photoPath; } }} alt="Parent container"/>
                                {:else if loc.container?.photoPath}
                                    <img class="w-full h-full object-cover object-top" src="{loc.container.photoPath.replace(/\.[^/.]+$/, '_thumb.jpg')}" on:error={(e) => { if (!(e.currentTarget as HTMLImageElement).dataset.fb) { (e.currentTarget as HTMLImageElement).dataset.fb = '1'; (e.currentTarget as HTMLImageElement).src = loc.container.photoPath; } }} alt="Container thumbnail"/>
                                {:else}
                                    <div class="w-full h-full flex items-center justify-center">
                                        <i class="bi bi-box-seam text-4xl text-gray-400"></i>
                                    </div>
                                {/if}
                            </figure>
                        {/if}
                        <div class="card-body p-4 gap-1">
                            <div class="text-xs text-gray-500 uppercase tracking-wider font-semibold">Location {i > 0 ? `#${i+1}` : ''}</div>
                            <h3 class="card-title text-lg m-0">{loc.containerName}</h3>
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

            <!-- Tags (Shared) -->
            {#if data.item?.tags && data.item.tags.length > 0}
                <div class="flex flex-wrap justify-start gap-2 mt-1">
                    {#each data.item?.tags as tag}
                        <div class="badge badge-ghost badge-sm">
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

    {#if data.item.attributes.length > 0}
        <div class="title font-bold  mb-3">
            Attributes
        </div>

        <div class="flex flex-col md:flex-row w-full">

            <div class="overflow-x-auto">
                <table class="table content prose max-w-none">
                    <tbody>
                        {#each data.item.attributes as attrib}
                            <tr>
                                <td>
                                    {attrib.key}
                                </td>
                                <td>
                                    {attrib.value}
                                </td>
                            </tr>
                        {/each}

                        {#each photoAttributes as attrib}
                            <tr>
                                <td>
                                    {attrib.key}
                                </td>
                                <td>
                                    {attrib.value}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
    
    <div class="border-b border-base-300 pb-3 mb-3">
        {#if otherPhotos.length > 0}
            <div class="title font-bold  mb-3">
                More information
            </div>

            <div class="mb-3">
                {#each otherPhotos as photo}
                    <button type="button" class="p-0 border-none bg-transparent" on:click={() => { currentLightboxImage = photo; lightboxModal.showModal(); }}>
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
                    <div class="collapse-title bg-slate-800">
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

            <div class="justify-between items-center w-full">
                {#each invoicePhotos as photo}
                    <button type="button" class="p-0 border-none bg-transparent" on:click={() => { currentLightboxImage = photo; lightboxModal.showModal(); }}>
                        <img
                            src="{photo.orgPath}"
                            alt="Invoice attachment"
                            class="h-32 w-32 cursor-zoom-in">
                    </button>
                {/each}
            </div>
        </div>
    {/if}

    <div class="border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">
            Colors in product photos
        </div>
        {#each productPhotos as photo}
            {#if photo.colors?.length > 2}
                {@const cols=Object.keys(JSON.parse(photo.colors))}
                {@const names=Object.values(JSON.parse(photo.colors))}
                {#each cols as col, i}
                    <div class="tooltip m-1 shadow text-xs items-center text-center p-1" data-tip="{names[i]} ({col})">
                        <div class="w-10 h-10" style="background-color:{col}">
                        </div>
                    </div>
                {/each}
            {/if}
        {/each}
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


<dialog bind:this={lightboxModal} id="lightboxModal" class="modal">
  <div class="modal-box max-w-none w-8/10">
    <form method="dialog">
      <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
    </form>

    {#if currentLightboxImage}
        {@const ai = currentLightboxImage.llmAnalysis ? JSON.parse(currentLightboxImage.llmAnalysis) : null}
        <h3 class="font-bold text-lg">
            {ai?.description || data.item.title}
            <span class="text-xs">
                <a href="{currentLightboxImage.orgPath}" target="_blank">-- Show original</a>
            </span>
    
        </h3>
        <p class="py-4 text-center ">
            {#if currentLightboxImage.cropPath && currentLightboxImage.type === "product"}
                <img src="{currentLightboxImage.cropPath}" alt="Enlarged view" class="object-scale-down h-full w-full"/>
            {:else}
                <img src="{currentLightboxImage.orgPath}" alt="Enlarged view" class="object-scale-down h-full w-full"/>
            {/if}
            <span class="text-xs">
                Tap x, press ESC key or click outside to close.
            </span>
        </p>

        <span class="text-xs">
            Type: {currentLightboxImage.type},
            Category: <span class="badge badge-sm badge-ghost">{ai?.subCategory || 'Unknown'}</span>
        </span>
        <br/>
        {#if currentLightboxImage.colors?.length > 2}
            {@const cols=Object.keys(JSON.parse(currentLightboxImage.colors))}
            {@const colNames=Object.values(JSON.parse(currentLightboxImage.colors))}
            {#each cols as col, i}
                <div class="tooltip m-1 shadow text-xs items-center text-center p-1" data-tip="{colNames[i]} ({col})">
                    <div class="w-10 h-10" style="background-color:{col}">
                    </div>
                    <!--{colNames[i]}-->
                </div>
            {/each}
            <br/>
        {/if}
    {/if}

  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>