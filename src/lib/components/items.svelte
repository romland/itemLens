<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { Item } from "@prisma/client";
    import Delete from "./delete.svelte";

    export let items: Item[];
</script>

{#if (items.length == 0)}
    <Alert>Empty.</Alert>
{:else}

    <div class="overflow-x-auto">
        <table class="table">
            <!-- head
            <thead>
                <tr>
                    <th>Pic</th>
                    <th>Whut</th>
                    <th>Action</th>
                </tr>
            </thead>
            -->
            <tbody>
                
                {#each items as item}
                    <tr class="hover">
                        <td>
                            <div class="flex items-center gap-3">
                                <div class="avatar">
                                    <div class="mask mask-squircle w-12 h-12">
                                        {#if item.photos.length > 0 && item.photos[0].thumbPath}
                                            <img class="mask mask-squircle object-scale-down h-16 w-16" src="{item.photos[0].thumbPath}" alt="{item.name}"/>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        </td>

                        <td>
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

                        <td class="whitespace-nowrap ">
                            <a href="/{item.id}/edit" title="Edit Item" class="text-gray-500">
                                <i class="bi bi-pencil-square"></i>
                            </a>
                            <Delete message='Delete this item: {item.title}?' action='/{item.id}/delete' />
                        </td>
                    </tr>
                {/each}
                
            </tbody>

            <!-- foot
            <tfoot>
                <tr>
                    <th>Pic</th>
                    <th>Whut</th>
                    <th>Action</th>
                </tr>
            </tfoot>
            -->
            
        </table>
    </div>

{/if}