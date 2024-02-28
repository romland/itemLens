<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { Item } from "@prisma/client";
    import Delete from "./delete.svelte";

    export let items: Item[];
    export let brief: boolean = false;

    function getFirstProductPhoto(item)
    {
        for(let i = 0; i < item?.photos?.length; i++) {
            if(item.photos[i].type === "product") {
                return item.photos[i];
            }
        }
        // TODO: return a default image
        return "";
    }

    function hasSummarizedDocuments(item)
    {
        for(let i = 0; i < item.documents.length; i++) {
            if(item.documents[i].summary !== null) {
                return true;
            }
        }
        return false;
    }
</script>

{#if (!items || items?.length == 0)}
    <Alert>Empty.</Alert>
{:else}

    <div class="overflow-x-auto">
        <table class="table" width="100%">
            <tbody>

                {#each items as item}
                    <tr class="hover">
                        <td>
                            <div class="flex items-center gap-3">
                                <div class="avatar">
                                    <div class="mask mask-squircle w-12 h-12">
                                        <a href="/{item.id}/{item.slug}">
                                            <img class="mask mask-squircle object-scale-down h-16 w-16" src="{getFirstProductPhoto(item).thumbPath}" alt="{item?.name}"/>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </td>

                        <td>
                            {#each item.locations as loc}
                                <div class="badge badge-ghost badge-sm whitespace-nowrap">
                                    <a href="/container/{loc.containerName.replace(" ", "-")}">{loc.containerName}</a>
                                </div>
                            {/each}
                        </td>

                        <td>
                            <a class="text-base font-semibold" href="/{item.id}/{item.slug}">{item.title}</a>
                        <!-- </td> -->
{#if !brief}
                        <!-- <td> -->
                        <div class="hidden lg:block">
                            <div class=";" style="overflow: hidden; text-overflow: ellipsis; max-height: 3em;">
                                <a href="/{item.id}/{item.slug}">
                                    {item.description}
                                </a>
                            </div>

                            <!--div class="invisible lg:visible"-->
                            <div class="hidden lg:block pt-2">
                                {#each item?.tags as tag}
                                    <div class="badge badge-ghost badge-sm">
                                        <a href="/tag/{tag.slug}">{tag.name}</a>
                                    </div>
                                {/each}

                                <div class="badge badge-ghost badge-sm">
                                    <!-- TODO: remove from inline -->
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                    </svg>
                                    &nbsp;{item.documents.length}
                                    {#if !hasSummarizedDocuments(item)}
                                        TODO: Need summary!
                                    {/if}

                                    {#if getFirstProductPhoto(item).classTrash}
                                        <!--
                                        This is largely for debug to see if classification is correct and
                                        whether I can trust it to put things in the right inventory in the
                                        future.
                                        -->
                                        Class: {JSON.parse(getFirstProductPhoto(item).classTrash).predicted_classes}
                                    {/if}
                                </div>
                            </div>
                        </div>
{/if}                        
                        </td>
{#if !brief}
                        <td class="whitespace-nowrap ">
                            <a href="/{item.id}/edit" title="Edit Item" class="text-gray-500">
                                <i class="bi bi-pencil-square"></i>
                            </a>
                            <!--
                            <Delete message='Delete this item: {item.title}?' action='/{item.id}/delete' />
                            -->
                        </td>
{/if}                        
                    </tr>
                {/each}
                
            </tbody>
            
        </table>
    </div>

{/if}
