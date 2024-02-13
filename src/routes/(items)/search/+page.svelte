<script lang="ts">
    import type { PageServerData } from "./$types";
    import Navigation from "$lib/components/navigation.svelte";
    import Items from "$lib/components/items.svelte";
    import Search from "$lib/components/search.svelte";
    
    export let data: PageServerData;
</script>

<svelte:head>
    <title>{data.q}</title>
</svelte:head>
<!--
<Search q={data.q} />
-->

<Items items={data.items} />

<Navigation href="/search?q={data.q}&" prevPage={data.prevPage} nextPage={data.nextPage} />