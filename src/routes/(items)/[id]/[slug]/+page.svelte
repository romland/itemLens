<script lang="ts">
    import type { PageServerData } from "./$types";
    import Delete from "$lib/components/delete.svelte";
    import { toTextDocument, refine, refineForLLM } from "$lib/shared/ocrparser";
    import { afterNavigate, beforeNavigate } from '$app/navigation'
    import { marked } from "marked";
    
    export let data: PageServerData;
    
    var refreshIntervalId = null;
    let productPhotos = [], invoicePhotos = [], otherPhotos = [];
    let photoAttributes = [];
    let classTrash = []
    let classBlip = [];
    let currentLightboxImage = null;

    beforeNavigate(() => {
        {
            if(refreshIntervalId) {
                clearInterval(refreshIntervalId);
            }
        }
    });

    // Issue: https://kit.svelte.dev/docs/state-management#component-and-page-state-is-preserved
    afterNavigate(() => {
        if(refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }
        refineItemData();
    });

    function refineItemData()
    {
        console.log("refineItemData", data.item.id);

        if(data.item?.photos?.length > 0) {
            productPhotos = data.item.photos.filter((photo) => { return photo.type === "product" });
            invoicePhotos = data.item.photos.filter((photo) => { return photo.type === "invoice or receipt" });
            otherPhotos =  data.item.photos.filter((photo) => { return photo.type === "information" || photo.type === "other" });
        }
        
        // TODO: This should be done during initial processing (once), not every time rendering
        photoAttributes = [];
        classTrash = [];
        classBlip = [];
        
        for(let i = 0; i < data.item.photos?.length; i++) {
            const photo = data.item.photos[i];
            
            if(photo.type === "product") {
                if(photo.classTrash) {
                    classTrash.push(getClassTrash(photo));
                } else {
                    classTrash.push("")
                }
                
                if(photo.classBlip) {
                    classBlip.push(getClassBlip(photo));
                } else {
                    classBlip.push("");
                }
            }
            
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
        photoAttributes = photoAttributes;
        //  console.log(classTrash, classBlip);
    }
    
    function getClassTrash(photo)
    {
        const cls = JSON.parse(photo.classTrash);
        return cls?.predicted_classes[0] || "";
    }

    function getClassBlip(photo)
    {
        const cls = photo.classBlip;
        if(cls.length > 0) {
            return cls.replace('"', "").replace("Caption:", "");
        }
        return "";
    }

    function alterSummary(txt)
    {
        if(!txt) return "";

        // TODO: Security. Sanitize?
        // markdownHtml = marked.parse(data.item?.description!, {gfm:true,breaks:true});
        return marked.parse(txt, {gfm:true,breaks:true});
    }
    
    if(typeof window !== 'undefined') {
        // Periodically check if we have updated data for this page.
        // I suppose using a MessageChannel or so on the Service Worker 
        // could be a future improvement? I'd have to read up on that.
        let fetchDone = true;
        if(!refreshIntervalId) {
            refreshIntervalId = setInterval(async () => {
                if(!fetchDone) {
                    return;
                }
                
                const res = await fetch(`/api/item?id=${data.item.id}`);
                const item = await res.json();
                data.item = item;
                refineItemData();
                fetchDone = true;
            }, 1000);   // TODO XXX: once per second is a bit excessive, but fine for now
        }
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

<article style="padding-bottom: 100px;" class="">

    <div class="flex justify-between items-center border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">
            {data.item?.title}
        </div>
        <div class="inline-flex gap-3">
            <a href="/{data.item?.id}/edit" title="Edit item" class="text-gray-500">
                <i class="bi bi-pencil-square"></i>
            </a>
            <Delete message='Delete this item?' action='/{data.item?.id}/delete' />
        </div>
    </div>

    <!-- flex flex-row -->
    <div class="flex flex-col md:flex-row w-full space-x-4">
        <div class="basis-4/5 pl-2">
            {#if productPhotos?.length > 0}
                <div class="carousel carousel-center max-w-md p-4 space-x-4 bg-neutral rounded-box max-h-80" style="background: linear-gradient(109.6deg, rgb(20, 30, 48) 11.2%, rgb(36, 59, 85) 91.1%);">
                    {#each productPhotos as photo, i}
                        <div id="carousel-item{i}" class="carousel-item w-full justify-center cursor-zoom-in">
                            {#if productPhotos[i].cropPath}
                                <img 
                                    on:click={(ev)=>{currentLightboxImage = productPhotos[i]; lightboxModal.showModal()}} 
                                    src="{productPhotos[i].cropPath}" alt="{classBlip[i] || data.item.title}" 
                                    class="object-scale-down">
                            {:else}
                                <img src="{productPhotos[i].orgPath}" alt="{data.item?.title}" class="">
                            {/if}
                        </div> 
                    {/each}
                </div>
                <div class="flex justify-start w-full py-2 gap-1">
                    {#each productPhotos as photo, i}
                        <button on:click={()=> { document.getElementById("carousel-item" + i).scrollIntoView({ block: 'nearest', inline: 'center' }) }} class="btn ">
                            <img class="object-scale-down w-10 h-10" src="{photo.cropPath}"/>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="w-3/5">
            <div class="stats shadow">
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
                <div class="stat">
                    {#each data.item.locations as loc, i}
                        {#if i === 0}
                            <div class="stat-figure text-secondary">
                                {#if loc.container.parent?.photoPath}
                                    <img class="h-18" src="{loc.container.parent.photoPath}"/>
                                {:else}
                                    <img class="h-18" src="/images/containers/{loc.container.parentId}_thumb.jpg"/>
                                {/if}
                            </div>
                            <div class="stat-title">
                                <span class="text-xs">{loc.container?.parent?.description}</span>
                            </div>
                            <div class="stat-value text-secondary">
                                {loc.containerName}
                            </div>

                            {#if data.item.locations.length === 1}
                                <div class="stat-desc">&nbsp;</div>
                            {/if}
                        {:else}
                            <div class="stat-desc">
                                <div class="badge badge-ghost">{loc.containerName}</div>
                            </div>
                        {/if}
                    {/each}
                </div>

            </div>

            {#if data.item.reason}
                <div class="mb-3 text-sm">
                    Reason: {data.item.reason}<br/>
                </div>
            {/if}

            {#if data.item?.tags}
                <div class="flex flex-wrap justify-center gap-3">
                    {#each data.item?.tags as tag}
                        <div class="badge badge-ghost">
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
                    <img 
                        on:click={(ev)=>{currentLightboxImage = photo; lightboxModal.showModal()}}
                        src="{photo.orgPath}"
                        class="w-32 h-32 cursor-zoom-in">
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

                            <a href="{doc.path}" target="_blank">{doc.source}</a>
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
                    <img
                        on:click={(ev)=>{currentLightboxImage = photo; lightboxModal.showModal()}}
                        src="{photo.orgPath}"
                        class="h-32 w-32 cursor-zoom-in">
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

</article>


<dialog id="lightboxModal" class="modal">
  <div class="modal-box max-w-none w-8/10">
    <form method="dialog">
      <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
    </form>

    {#if currentLightboxImage}
        <h3 class="font-bold text-lg">
            {JSON.parse(currentLightboxImage.classBlip) || data.item.title}
            <span class="text-xs">
                <a href="{currentLightboxImage.orgPath}" target="_blank">-- Show original</a>
            </span>
    
        </h3>
        <p class="py-4 text-center ">
            {#if currentLightboxImage.cropPath && currentLightboxImage.type === "product"}
                <img src="{currentLightboxImage.cropPath}" class="object-scale-down h-full w-full"/>
            {:else}
                <img src="{currentLightboxImage.orgPath}" class="object-scale-down h-full w-full"/>
            {/if}
            <span class="text-xs">
                Tap x, press ESC key or click outside to close.
            </span>
        </p>

        <span class="text-xs">
            Type: {currentLightboxImage.type},
            classification: {JSON.parse(currentLightboxImage.classTrash)?.predicted_classes}
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