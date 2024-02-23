<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { Item } from "@prisma/client";
    import Delete from "./delete.svelte";

    export let items: Item[];

    function getFirstProductPhoto(item)
    {
        for(let i = 0; i < item.photos.length; i++) {
            if(item.photos[i].type === "product") {
                return item.photos[i].thumbPath;
            }
        }
        // TODO: return a default image
        return "";
    }
</script>

{#if (items.length == 0)}
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
                                            <img class="mask mask-squircle object-scale-down h-16 w-16" src="{getFirstProductPhoto(item)}" alt="{item.name}"/>
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

                        <td width="20%">
                            <a href="/{item.id}/{item.slug}">{item.title}</a>
                            <!--div class="invisible lg:visible"-->
                            <div class="hidden lg:block">
                                {#each item?.tags as tag}
                                    <div class="badge badge-ghost badge-sm">
                                        <a href="/tag/{tag.slug}">{tag.name}</a>
                                    </div>
                                {/each}
                            </div>
                        </td>

                        <td class="hidden lg:block" width="100%">
                            <div class="" style="overflow: hidden; text-overflow: ellipsis; max-height: 4em;">
                                <a href="/{item.id}/{item.slug}">
                                    {item.description}
                                </a>
                            </div>
                        </td>
                        
                        <td class="whitespace-nowrap ">
                            <a href="/{item.id}/edit" title="Edit Item" class="text-gray-500">
                                <i class="bi bi-pencil-square"></i>
                            </a>
                            <Delete message='Delete this item: {item.title}?' action='/{item.id}/delete' />
                        </td>
                    </tr>
                {/each}
                
            </tbody>
            
        </table>
    </div>

{/if}
