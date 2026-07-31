<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { Item } from "@prisma/client";
    import Delete from "./delete.svelte";

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
        // Safely return an object so `.thumbPath` never throws an exception
        return { thumbPath: "/placeholder.png", classTrash: null };
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
                    <tr class="hover">
                        <td>
                            <div class="flex items-center gap-3">
                                <div class="avatar">
                                    <div class="mask mask-squircle w-12 h-12 bg-base-200">
                                        <a href="/{item.id}/{item.slug}">
                                            <img class="mask mask-squircle object-scale-down h-16 w-16" src="{getFirstProductPhoto(item).thumbPath}" alt="{item.title || 'Item image'}"/>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </td>

                        <td>
                            {#if item.locations}
                                {#each item.locations as loc}
                                    <div class="badge badge-ghost badge-sm whitespace-nowrap">
                                        <!-- Note: replace(/ /g, "-") replaces ALL spaces, not just the first one -->
                                        <a href="/container/{loc.containerName.replace(/ /g, '-')}">{loc.containerName}</a>
                                    </div>
                                {/each}
                            {/if}
                        </td>

                        <td>
                            <a class="text-base font-semibold" href="/{item.id}/{item.slug}">{item.title}</a>
                            
                            {#if !brief}
                            <div class="hidden lg:block mt-1">
                                <!-- Replaced inline style hack with Tailwind's native line-clamp -->
                                <div class="line-clamp-2 text-sm text-gray-500">
                                    <a href="/{item.id}/{item.slug}">
                                        {item.description}
                                    </a>
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

                                    {#if getFirstProductPhoto(item).classTrash}
                                        <span class="text-xs text-gray-400">
                                            Class: {JSON.parse(getFirstProductPhoto(item).classTrash).predicted_classes}
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