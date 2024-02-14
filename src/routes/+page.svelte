<script lang="ts">
    import type { PageServerData } from "./$types";
    import Navigation from "$lib/components/navigation.svelte";
    import Items from "$lib/components/items.svelte";
    import Search from "$lib/components/search.svelte";
    import Title from "$lib/components/Title.svelte";
    
    export let data: PageServerData;
    console.log("whut", data)
</script>

<svelte:head>
    <Title>Home</Title>
</svelte:head>

<!--
    <Search />
-->

<Items items={data.items} />

<Navigation href="/?" prevPage={data.prevPage} nextPage={data.nextPage} />