<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { beforeNavigate } from '$app/navigation';
    import Items from "$lib/components/items.svelte";
    
    export let prevPage: number;
    export let nextPage: number;
    export let href: string;
    
    let loadedPages: any[] = [];
    let reachedEnd = false;
    let loading = false;
    let observer: IntersectionObserver;

	const handleSync = () => {
		loadedPages = [];
		nextPage = 1;
		reachedEnd = false;
	};

    // Tie the cache directly to the specific page/search URL
    $: cacheKey = `nav-cache-${href}`;

    // Fire exactly when the user clicks a link to leave the page
    beforeNavigate(() => {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(cacheKey, JSON.stringify({
                loadedPages,
                nextPage,
                reachedEnd
            }));
        }
    });

    async function query() {
        let h = href.replace("/search?", "/api/items?").replace("/?", "/api/items?");
        const url = `${h}c=10&page=${nextPage}`;
        
        try {
			// Explicitly command fetch to bypass browser disk cache
			const res = await fetch(url, { cache: 'no-store' });
            const data = await res.json();
            
            if(!data || !data.items || data.items.length === 0) {
                reachedEnd = true;
                return;
            }

            loadedPages = [...loadedPages, data.items];
        } catch (e) {
            console.error("Fetch error:", e);
        }
    }
    
    function handleIntersection(entries: IntersectionObserverEntry[]) {
        const entry = entries[0];
        
        if (!entry.isIntersecting) return;
        if (loading || reachedEnd || nextPage === 0) return;
        
        loading = true;
        query().then(() => {
            loading = false;
            if (!reachedEnd) {
                nextPage++;
            }
        });
    }
    
    onMount(async () => {
		window.addEventListener('app-sync', handleSync);

        // Check if we have a saved state for this exact search/page
        if (typeof sessionStorage !== 'undefined') {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    loadedPages = parsed.loadedPages;
                    nextPage = parsed.nextPage;
                    reachedEnd = parsed.reachedEnd;
                } catch (e) {
                    console.error("Cache parse error", e);
                }
            }
        }

        // Wait for Svelte to physically draw the restored items into the DOM.
        // This is CRUCIAL so the browser has enough page height to restore your scroll position.
        await tick();

        //  Set up the observer
        const el = document.getElementById('postScrollArea');
        if (el) {
            observer = new IntersectionObserver(handleIntersection, {
                root: null,
                rootMargin: '100px', // Fetch slightly before they hit the absolute bottom
                threshold: 0.1
            });
            observer.observe(el);
        }
    });

    onDestroy(() => {
		if (typeof window !== 'undefined') window.removeEventListener('app-sync', handleSync);
        if (observer) observer.disconnect();
    });
</script>

{#each loadedPages as page}
    <Items items={page} />
{/each}

<div id="postScrollArea" class="flex justify-center gap-3 py-6">
    {#if prevPage > 0 && loadedPages.length === 0}
        <a href="{href}page={prevPage}" class="btn btn-sm" aria-label="Previous Page"><i class="bi bi-arrow-left"></i></a>
    {/if}

    {#if nextPage > 0 && !reachedEnd}
        <a href="{href}page={nextPage}" class="btn btn-sm">
            {#if loading}
                <span class="loading loading-spinner loading-sm"></span>
            {:else}
                <i class="bi bi-arrow-right"></i>
            {/if}
        </a>
    {/if}
</div>