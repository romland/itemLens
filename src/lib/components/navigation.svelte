<script lang="ts">
    import { onMount } from 'svelte'
    import Items from "$lib/components/items.svelte";
    import { afterNavigate, beforeNavigate } from '$app/navigation'
    
    export let prevPage: number;
    export let nextPage: number;
    export let href: string;
    
    let loadedPages = [];
    let reachedEnd = false;
    let loading = false;
    let observer;

    beforeNavigate(() => {
        loadedPages = [];
    });

    async function query(ev)
    {
        const h = href.replace("/search?", "/api/items?").replace("/?", "/api/items?");
        const res = await fetch(`${h}c=10&page=${nextPage}`);
        const data = await res.json();
        console.log("Fetched page", nextPage);
        
        if(!data || !data.items || data.items.length === 0) {
            reachedEnd = true;
            return;
        }

        loadedPages.push(data.items);
        loadedPages = loadedPages;
    }
    
    async function handleIntersection(event)
    {
        const [entries] = event;
        
        if (!entries.isIntersecting) {
            loading = false;
            return
        }
        
        if(reachedEnd) {
            console.log("Reached end");
            return;
        }

        if(loading) {
            return;
        }
        
        loading = true;
        try {
            await query(event);
            loading = false;
            nextPage++;
        } catch(ex) {
            console.error(ex);
            loading = false;
        }
    }
   
    
    function setupInfiniteScrollObserver()
    {
        let options = {
            root: null, //document.getElementById('mainScrollArea'),
            rootMargin: '0px',
            threshold: [0.1],
        }
        
        // TODO: Disable observer on navigating away? I assume it is needed?
        observer = new IntersectionObserver(handleIntersection, options)
        
        loading = false;
        try {
            observer.observe(document.getElementById('postScrollArea'));
        } catch (error) {
            console.log("Error setting up IntersectionObserver", error)
        }
    }
    
    onMount(async () => {
        loadedPages = [];
        if (typeof window !== "undefined") {
            // Disable this call to have normal pagination instead of infinite scroll
            setupInfiniteScrollObserver();
        }
    })

</script>

{#each loadedPages as page}
    <Items items={page} />
{/each}

<div id="postScrollArea" class="flex justify-center gap-3">
    {#if prevPage > 0}
        <a href="{href}page={prevPage}" class="btn btn-sm"><i class="bi bi-arrow-left" /></a>
    {/if}

    {#if nextPage > 0}
        <a href="{href}page={nextPage}" class="btn btn-sm"><i class="bi bi-arrow-right" /></a>
    {/if}
</div>
