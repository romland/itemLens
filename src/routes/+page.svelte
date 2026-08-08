<script lang="ts">
    import type { PageServerData } from "./$types";
    import Navigation from "$lib/components/navigation.svelte";
    import Items from "$lib/components/items.svelte";
    import Search from "$lib/components/search.svelte";
    
    export let data: PageServerData;

    import pageTitle from '$lib/stores';
    pageTitle.set(":)");
</script>

{#if data.unassignedCount > 0}
    <div class="alert bg-warning/20 border border-warning text-warning-content shadow-sm mb-6 flex justify-between items-center rounded-xl">
        <div class="flex items-center gap-3">
            <i class="bi bi-exclamation-triangle-fill text-xl"></i>
            <div>
                <h3 class="font-bold">Unassigned Items</h3>
                <div class="text-sm">You have {data.unassignedCount} item{data.unassignedCount === 1 ? '' : 's'} without a location.</div>
            </div>
        </div>
        <a href="/unassigned" class="btn btn-warning btn-sm shadow-sm rounded-lg">Review</a>
    </div>
{/if}

<Items items={data.items} />

<Navigation href="/?" prevPage={data.prevPage} nextPage={data.nextPage} />