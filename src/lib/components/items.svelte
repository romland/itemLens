<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { Item } from "@prisma/client";
    import Delete from "./delete.svelte";
    import { navigating } from '$app/stores';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import ImageLightbox from "$lib/components/ImageLightbox.svelte";

    export let items: any[] = [];
    export let brief: boolean = false;
    export let showControls: boolean = true;

    function getFirstProductPhoto(item) {
        if (item?.photos?.length > 0) {
            for (let i = 0; i < item.photos.length; i++) {
                if (item.photos[i].type === "product") {
                    return item.photos[i];
                }
            }
        }
        return { thumbPath: "", orgPath: "", showOriginal: false, classTrash: null };
    }

    function hasSummarizedDocuments(item) {
        if (!item?.documents) return false;
        for (let i = 0; i < item.documents.length; i++) {
            if (item.documents[i].summary !== null) {
                return true;
            }
        }
        return false;
    }

    let viewMode = 'list';
    let viewModeLoaded = false;
    let lightbox: ImageLightbox;

    onMount(() => {
        const cached = localStorage.getItem('itemlens_viewmode_' + $page.data.activeInventoryId);
        if (cached === 'list' || cached === 'grid') viewMode = cached;
        viewModeLoaded = true;
    });

    $: if (viewModeLoaded) {
        localStorage.setItem('itemlens_viewmode_' + $page.data.activeInventoryId, viewMode);
    }
</script>

{#if (!items || items.length === 0)}
    <Alert>Empty.</Alert>
{:else}
    {#if showControls}
        <div class="flex justify-end mb-3 mt-1">
            <div class="join bg-base-200/60 p-0.5 rounded-lg border border-base-300/60 shadow-sm">
                <button type="button" class="join-item btn btn-sm border-none shadow-none h-8 min-h-0 {viewMode === 'list' ? 'bg-base-100 text-base-content font-bold' : 'bg-transparent text-gray-500 hover:bg-base-300'}" on:click={() => viewMode = 'list'} aria-label="List View"><i class="bi bi-list-ul text-lg"></i></button>
                <button type="button" class="join-item btn btn-sm border-none shadow-none h-8 min-h-0 {viewMode === 'grid' ? 'bg-base-100 text-base-content font-bold' : 'bg-transparent text-gray-500 hover:bg-base-300'}" on:click={() => viewMode = 'grid'} aria-label="Grid View"><i class="bi bi-grid text-lg"></i></button>
            </div>
        </div>
    {/if}
    {#if viewMode === 'list'}
        <div class="overflow-x-auto bg-base-100 border border-base-200 rounded-xl shadow-sm">
        <table class="table w-full">
            <tbody>
                {#each items as item}
                    <!-- 
                        Check if the URL we are waiting for starts with this item's ID.
                        This catches clicks on the image, the title, AND the edit button!
                    -->
                    {@const isNavigatingToThis = $navigating?.to?.url.pathname.startsWith(`/${item.id}/`)}
                    {@const mainPhoto = getFirstProductPhoto(item)}
                    
                   <tr on:click={(e) => { if (!e.target.closest('a') && !e.target.closest('button')) goto(`/${item.id}/${item.slug}`); }} class="hover:bg-base-200/50 cursor-pointer transition-all duration-200 border-b border-base-200/50 last:border-none {isNavigatingToThis ? 'opacity-50 pointer-events-none scale-[0.98]' : ''}">
                       <td class="w-16 sm:w-20 min-w-[4rem] sm:min-w-[5rem] shrink-0 py-3">
                            <div class="flex items-center gap-3">
                                <div class="avatar">
                                   <div class="w-14 h-14 bg-base-100 rounded-2xl shadow-sm border border-base-200/60 overflow-hidden flex items-center justify-center">
                                       <a href="/{item.id}/{item.slug}" class="w-full h-full flex items-center justify-center bg-transparent">
                                           {#if mainPhoto.thumbPath || mainPhoto.orgPath}
                                               <img class="object-contain w-full h-full p-1 rounded-xl" src="{mainPhoto.showOriginal ? mainPhoto.orgPath?.replace(/\.[^/.]+(?=\?|$)/, '_org_thumb.webp') : mainPhoto.thumbPath}" on:error={(e) => { const target = e.currentTarget as HTMLImageElement; if (!target.dataset.fb) { target.dataset.fb = '1'; target.src = mainPhoto.thumbPath || mainPhoto.orgPath || ''; } }} alt="{item.title || 'Item image'}"/>
                                           {:else}
                                               <i class="bi bi-box text-2xl text-gray-300"></i>
                                           {/if}
                                       </a>
                                   </div>
                                </div>
                            </div>
                        </td>

                        <td class="hidden sm:table-cell w-20 min-w-[5rem]">
                            <div class="flex flex-col gap-1 min-w-[4rem]">
                                {#if item.locations}
                                    {#each item.locations as loc}
                                        <div class="badge badge-ghost badge-sm w-16 overflow-hidden shrink-0">
                                            <a href="/container/{loc.container.name.replace(/ /g, '-')}" class="truncate w-full text-center" title="{loc.container.name}">{loc.container.name}</a>
                                            <a href="/container/{encodeURIComponent(loc.container.name)}" class="truncate w-full text-center" title="{loc.container.name}">{loc.container.name}</a>
                                        </div>
                                    {/each}
                                {/if}
                            </div>
                        </td>

                        <td class="w-full">
                            <div class="flex items-center gap-2">
                                <a class="text-base font-semibold" href="/{item.id}/{item.slug}">{item.title}</a>
                                <!-- Show a loading spinner right next to the title while we wait -->
                                {#if isNavigatingToThis}
                                    <span class="loading loading-spinner loading-sm text-primary"></span>
                                {/if}
                            </div>

                            <!-- MOBILE ONLY LOCATIONS -->
                            <div class="sm:hidden mt-1 flex flex-col gap-1.5 w-full">
                                {#if item.description && !brief}
                                    <div class="text-[11px] text-gray-500 line-clamp-1 leading-tight">{item.description}</div>
                                {/if}
                                <div class="flex flex-wrap gap-1">
                                    {#if item.locations}
                                        {#each item.locations as loc}
                                            <div class="badge badge-ghost text-[10px] px-1.5 py-0.5 h-auto whitespace-nowrap">
                                                <a href="/container/{encodeURIComponent(loc.container.name)}" class="truncate w-full text-center" title="{loc.container.name}">{loc.container.name}</a>
                                            </div>
                                        {/each}
                                    {/if}
                                </div>
                            </div>

                            {#if !brief}
                            <div class="hidden lg:block mt-1">
                                <div class="line-clamp-2 text-sm text-gray-500">
                                    {item.description}
                                </div>

                                <div class="hidden lg:flex pt-2 gap-2 flex-wrap items-center">
                                    {#if item.tags}
                                        {#each item.tags as tag}
                                            <div class="badge badge-ghost badge-sm">
                                                <a href="/tag/{tag.slug}">{tag.name}</a>
                                            </div>
                                        {/each}
                                    {/if}

                                    {#if item.documents && item.documents.length > 0}
                                        <div class="badge badge-ghost badge-sm gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                            </svg>
                                            {item.documents.length}
                                            {#if !hasSummarizedDocuments(item)}
                                                <span class="text-warning ml-1">TODO: Need summary!</span>
                                            {/if}
                                        </div>
                                    {/if}

                                    {#if mainPhoto.category?.name || mainPhoto.llmAnalysis}
                                        <span class="text-xs text-gray-400 capitalize">
                                            {mainPhoto.category?.name || JSON.parse(mainPhoto.llmAnalysis || '{}')?.subCategory || 'Unknown'}
                                        </span>
                                    {/if}
                                </div>
                            </div>
                            {/if}                        
                        </td>

                        {#if !brief}
                        <td class="whitespace-nowrap">
                            <a href="/{item.id}/edit" title="Edit Item" class="text-gray-500 hover:text-primary">
                                <i class="bi bi-pencil-square"></i>
                            </a>
                        </td>
                        {/if}                        
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pb-4">
            {#each items as item}
                {@const isNavigatingToThis = $navigating?.to?.url.pathname.startsWith(`/${item.id}/`)}
                {@const mainPhoto = getFirstProductPhoto(item)}
                
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="card bg-base-100 shadow-sm border border-base-200 cursor-pointer hover:border-primary/50 transition-all duration-200 {isNavigatingToThis ? 'opacity-50 pointer-events-none scale-[0.98]' : ''}" on:click={(e) => { if (!e.target.closest('a') && !e.target.closest('button')) goto(`/${item.id}/${item.slug}`); }} role="button" tabindex="0">
                    <figure class="aspect-square bg-base-200/50 border-b border-base-200 p-2 relative" on:click|stopPropagation={() => lightbox.open(mainPhoto)}>
                        {#if mainPhoto.thumbPath || mainPhoto.orgPath}
                            <img class="object-contain w-full h-full rounded-lg mix-blend-multiply dark:mix-blend-normal" src="{mainPhoto.showOriginal ? mainPhoto.orgPath?.replace(/\.[^/.]+(?=\?|$)/, '_org_thumb.webp') : mainPhoto.thumbPath}" on:error={(e) => { const target = e.currentTarget as HTMLImageElement; if (!target.dataset.fb) { target.dataset.fb = '1'; target.src = mainPhoto.thumbPath || mainPhoto.orgPath || ''; } }} alt="{item.title || 'Item image'}"/>
                        {:else}
                            <i class="bi bi-box text-4xl text-gray-300"></i>
                        {/if}
                        {#if isNavigatingToThis}
                            <div class="absolute inset-0 bg-base-100/50 flex items-center justify-center">
                                <span class="loading loading-spinner text-primary"></span>
                            </div>
                        {/if}
                    </figure>
                    <div class="card-body p-3 gap-1">
                        <h3 class="font-bold text-sm leading-tight line-clamp-2">{item.title}</h3>
                        <div class="flex flex-wrap gap-1 mt-1">
                            {#if item.locations}
                                {#each item.locations as loc}
                                    <div class="badge badge-ghost text-[10px] px-1.5 py-0.5 h-auto whitespace-nowrap truncate max-w-[80%]">
                                        {loc.container.name}
                                    </div>
                                {/each}
                            {/if}
                            {#if mainPhoto.category?.name || mainPhoto.llmAnalysis}
                                <div class="badge badge-primary badge-outline text-[10px] px-1.5 py-0.5 h-auto whitespace-nowrap capitalize">
                                    {mainPhoto.category?.name || JSON.parse(mainPhoto.llmAnalysis || '{}')?.subCategory || 'Unknown'}
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <ImageLightbox bind:this={lightbox} />
{/if}