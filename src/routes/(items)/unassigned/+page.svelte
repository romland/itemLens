<script lang="ts">
    import type { PageServerData } from "./$types";
    import Items from "$lib/components/items.svelte";
    import pageTitle from '$lib/stores';
    
    export let data: PageServerData;
    
    pageTitle.set("Unassigned Items");
</script>

<div class="mb-6">
    <h2 class="text-2xl font-bold mb-2">Unassigned Items</h2>
    <p class="text-gray-500">These items have been saved but don't have a storage location assigned yet.</p>
</div>

<Items items={data.items} />