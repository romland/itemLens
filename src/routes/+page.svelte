<script lang="ts">
    import type { PageServerData } from "./$types";
    import Navigation from "$lib/components/navigation.svelte";
    import Items from "$lib/components/items.svelte";
    import Search from "$lib/components/search.svelte";
    
    export let data: PageServerData;
</script>

<svelte:head>
    <title>itemLens</title>
</svelte:head>

<!--
    <Search />
-->

<Items items={data.items} />

<Navigation href="/?" prevPage={data.prevPage} nextPage={data.nextPage} />