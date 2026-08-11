<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { Item } from "@prisma/client";
    import Delete from "./delete.svelte";
    import { navigating } from '$app/stores';
    import { goto } from '$app/navigation';

    export let items: any[] = [];
    export let brief: boolean = false;

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
</script>

{#if (!items || items.length === 0)}
    <Alert>Empty.</Alert>
{:else}
    <div class="overflow-x-auto">
        <table class="table w-full">
            <tbody>
                {#each items as item}
                    <!-- 
                        Check if the URL we are waiting for starts with this item's ID.
                        This catches clicks on the image, the title, AND the edit button!
                    -->
                    {@const isNavigatingToThis = $navigating?.to?.url.pathname.startsWith(`/${item.id}/`)}
                    {@const mainPhoto = getFirstProductPhoto(item)}
                    
                    <tr on:click={(e) => { if (!e.target.closest('a') && !e.target.closest('button')) goto(`/${item.id}/${item.slug}`); }} class="hover cursor-pointer transition-opacity duration-200 {isNavigatingToThis ? 'opacity-50 pointer-events-none' : ''}">
                        <td>
                            <div class="flex items-center gap-3">
                                <div class="avatar">
                                    <div class="mask mask-squircle w-12 h-12 bg-base-200">
                                        <a href="/{item.id}/{item.slug}">
                                            <img class="mask mask-squircle object-scale-down h-16 w-16 bg-base-100" src="{mainPhoto.showOriginal ? mainPhoto.orgPath + '_org_thumb.jpg' : mainPhoto.thumbPath}" on:error={(e) => { const target = e.currentTarget as HTMLImageElement; if (!target.dataset.fb) { target.dataset.fb = '1'; target.src = mainPhoto.thumbPath || mainPhoto.orgPath || ''; } }} alt="{item.title || 'Item image'}"/>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </td>

                        <td class="hidden sm:table-cell">
                            {#if item.locations}
                                {#each item.locations as loc}
                                    <div class="badge badge-ghost badge-sm whitespace-nowrap">
                                        <a href="/container/{loc.containerName.replace(/ /g, '-')}">{loc.containerName}</a>
                                    </div>
                                {/each}
                            {/if}
                        </td>

                        <td>
                            <div class="flex items-center gap-2">
                                <a class="text-base font-semibold" href="/{item.id}/{item.slug}">{item.title}</a>
                                <!-- Show a loading spinner right next to the title while we wait -->
                                {#if isNavigatingToThis}
                                    <span class="loading loading-spinner loading-sm text-primary"></span>
                                {/if}
                            </div>

                            <!-- MOBILE ONLY LOCATIONS -->
                            <div class="sm:hidden mt-1 flex flex-wrap gap-1">
                                {#if item.locations}
                                    {#each item.locations as loc}
                                        <div class="badge badge-ghost text-[10px] px-1.5 py-0.5 h-auto whitespace-nowrap">
                                            <a href="/container/{loc.containerName.replace(/ /g, '-')}">{loc.containerName}</a>
                                        </div>
                                    {/each}
                                {/if}
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

                                    {#if mainPhoto.llmAnalysis}
                                        <span class="text-xs text-gray-400">
                                            {JSON.parse(mainPhoto.llmAnalysis)?.subCategory || 'Unknown'}
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
{/if}