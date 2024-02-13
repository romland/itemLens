<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { Item } from "@prisma/client";
    import Delete from "./delete.svelte";

    export let items: Item[];
</script>

{#if (items.length == 0)}
    <Alert>Empty.</Alert>
{:else}
    <div class="notes mb-6">
        {#each items as item}
            <div class="note flex justify-between items-baseline border-b border-base-300 pb-2 mb-2">
                <div class="note-title">
                    <a href="/{item.id}/{item.slug}">{item.title}</a>
                </div>
                <div class="inline-flex gap-3">
                    <a href="/{item.id}/edit" title="Edit Item" class="text-gray-500">
                        <i class="bi bi-pencil-square"></i>
                    </a>
                    <Delete message='Delete this item: {item.title}?' action='/{item.id}/delete' />
                </div>
            </div>
        {/each}
    </div>
{/if}