<script lang="ts">
    export let item: any;
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();
</script>

<div class="flex items-center gap-3 bg-base-100 border border-base-200 p-2 rounded-xl shadow-sm w-full text-left group">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-base-200 flex items-center justify-center border border-base-300 cursor-zoom-in hover:opacity-80 transition-opacity" on:click={() => dispatch('zoom', item)}>
        {#if item.thumbPath}
            <img src={item.thumbPath} alt={item.title} class="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal" />
            <i class="bi bi-box text-xl text-gray-400 hidden"></i>
        {:else}
            <i class="bi bi-box text-xl text-gray-400"></i>
        {/if}
    </div>
    <a href="/{item.id}/{item.slug || 'view'}" target="_blank" class="flex-1 min-w-0 block">
        <div class="font-bold text-base-content text-sm truncate group-hover:text-primary transition-colors">{item.title}</div>
        <div class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold truncate mt-0.5">
            <i class="bi bi-box-seam mr-0.5"></i> {item.locationName || 'Unassigned'}
        </div>
    </a>
    <div class="shrink-0 pr-2 opacity-50 group-hover:opacity-100 group-hover:text-primary transition-opacity">
        <i class="bi bi-arrow-right-short text-2xl"></i>
    </div>
</div>
