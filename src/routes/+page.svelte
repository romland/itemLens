<script lang="ts">
    import type { PageServerData } from "./$types";
    import Navigation from "$lib/components/navigation.svelte";
    import Items from "$lib/components/items.svelte";
    import Search from "$lib/components/search.svelte";
    
    export let data: PageServerData;

    import pageTitle from '$lib/stores';
    pageTitle.set(":)");
</script>


<!--
    <Search />
-->

<Items items={data.items} />

<Navigation href="/?" prevPage={data.prevPage} nextPage={data.nextPage} />