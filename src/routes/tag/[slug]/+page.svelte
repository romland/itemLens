<script lang="ts">
    import type { PageServerData } from "./$types";
    import Navigation from "$lib/components/navigation.svelte";
    import Items from "$lib/components/items.svelte";
    
    export let data: PageServerData;
</script>

<svelte:head>
    <title>{data.tag?.name}</title>
</svelte:head>

<div class="flex justify-between items-center border-b border-gray-500 pb-2 mb-3">
    <div class="title font-bold uppercase">{data.tag?.name}</div>
</div>

<Items items={data.items} />

<Navigation href="/tag/{data.tag?.slug}?" prevPage={data.prevPage} nextPage={data.nextPage} />