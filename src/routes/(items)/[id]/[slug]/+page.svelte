<script lang="ts">
    import type { PageServerData } from "./$types";
    import Delete from "$lib/components/delete.svelte";
    import { refine, refineForLLM } from "$lib/shared/ocrparser";
    import { beforeNavigate } from '$app/navigation'
    import { marked } from "marked";
    
    export let data: PageServerData;
    
    var refreshIntervalId = null;
    let productPhotos = [], invoicePhotos = [], otherPhotos = [];
    let photoAttributes = [];
    let classTrash = []
    let classBlip = [];
    
    
    beforeNavigate(() => {
        {
            if(refreshIntervalId) {
                clearInterval(refreshIntervalId);
            }
        }
    });
    
    
    function refineItemData()
    {
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
    
    refineItemData();
    
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
            }, 2000);   // TODO XXX: once per second is a bit excessive, but fine for now
        }
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
    
    
    {#if productPhotos?.length > 0}
        <div class="carousel carousel-center max-w-md p-4 space-x-4 bg-neutral rounded-box max-h-80" style="background: linear-gradient(109.6deg, rgb(20, 30, 48) 11.2%, rgb(36, 59, 85) 91.1%);">
            {#each productPhotos as photo, i}
                <div id="carousel-item{i}" class="carousel-item w-full justify-center">
                    {#if productPhotos[i].cropPath}
                        <img src="{productPhotos[i].cropPath}" alt="{classBlip[i] || data.item.title}" class="">
                    {:else}
                        <img src="{productPhotos[i].orgPath}" alt="{data.item?.title}" class="">
                    {/if}
                </div> 
            {/each}
        </div>
        
        <div class="flex justify-center w-full py-2 gap-2">
            {#each productPhotos as photo, i}
                <button on:click={()=> { document.getElementById("carousel-item" + i).scrollIntoView({ block: 'nearest', inline: 'center' }) }} class="btn btn-xs">
                    {i+1}
                </button>
            {/each}
        </div>
    {/if}
    
    <div class="content prose max-w-none mb-3">
        {@html data.item?.contentToHtml}
    </div>
    
    {#if data.item?.tags}
    <div class="flex flex-wrap justify-center gap-3">
        {#each data.item?.tags as tag}
            <div class="badge badge-ghost">
                <a href="/tag/{tag.slug}">{tag.name}</a>
            </div>
        {/each}
    </div>
    {/if}
    
    
    
    <div class="overflow-x-auto">
        Attributes<b3/>
        <table class="table">
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
    
    <div class="border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">
            TODO move
        </div>

        COLORS!

        <div class="justify-between items-center">
            {data.item.amount}<br/>
            {data.item.reason}<br/>
            
            {#each data.item.locations as location}
                {location.containerName}
                <img src="/images/containers/{location.container.parentId}_thumb.jpg"/>
            {/each}
            <br/>
            
            {#each otherPhotos as photo}
                <img src="{photo.orgPath}" class="">
            {/each}
            <br/>
            
            Product page status<br/>
            <ul class="steps">
                <li class="step step-primary">
                    Uploaded information
                </li>
                <li class:step-primary={data.item.photos.length > 0 && data.item.photos[data.item.photos.length-1].cropPath} class="step">
                    Processed photos
                </li>
                <li class="step">
                    Downloaded documents
                </li>
                <li class="step">
                    Processed invoice
                </li>
            </ul>
            
        </div>
    </div>
    
    <div class="border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold  mb-3">
            More information
        </div>
        
        <div role="tablist" class="tabs  tabs-bordered w-full">
            {#each data.item.documents as doc,i}
                <div class="collapse collapse-arrow bg-base-200 mb-1">
                    <input type="radio" name="my-accordion-2" checked={i===0} />
                    <div class="collapse-title ">
                        {doc.title}
                    </div>
                    <div class="collapse-content prose prose-sm max-w-none"> 
                        {@html alterSummary(doc.summary)}
                        <br/><br/>
    
                        <div class="flex justify-starts">
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
    
<!--
    
                <input type="radio" name="my_tabs_2" role="tab" class="tab whitespace-nowrap" aria-label="{doc.title.substr(0,32)}" checked={i==1}/>
                <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6 w-full prose prose-sm max-w-none">
                    {@html alterSummary(doc.summary)}
                    <br/><br/>

                    <div class="flex justify-starts">
                        <img width="32" align="top" src="/images/i/document.svg" alt="document"/>
                        <a href="{doc.path}" target="_blank">{doc.source}</a>
                    </div>
                </div>

-->
    <div class="border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">
            Purchase Information
        </div>
        
        <div class="justify-between items-center">
            {#each invoicePhotos as photo}
                <img src="{photo.orgPath}" class="">
            {/each}
        </div>
        
    </div>
    
    
</article>