<script lang="ts">
    /*
     * Reason for having searching in here (as well) is that it is 
     * that 'search-as-you-type' is tied to the input field.
     */
    import Items from "$lib/components/items.svelte";
    import DropdownPanel from "$lib/components/DropdownPanel.svelte";
	import { page } from "$app/stores";

    export let q: string = '';
    let resultsAsYouType: HTMLDivElement;

    let items = [];
    let selectedIndex = -1;
    
    async function query(ev: Event, q: string)
    {
        if(!q || q.length === 0) {
            items = [];
            selectedIndex = -1;
            return;
        }

        const res = await fetch(`/api/items?q=${encodeURIComponent(q)}&c=8&sort=newest`);
        const data = await res.json();
        items = data.items;
        selectedIndex = -1;

        resultsAsYouType.classList.add("dropdown-open");
    }

    function focus(ev: Event)
    {
		resultsAsYouType.classList.add("dropdown-open");
    }

    function blur(ev: FocusEvent)
    {
        // If focus moved to one of our dropdown links, DO NOT close the dropdown
        if (resultsAsYouType.contains(ev.relatedTarget as Node)) return;
        
        setTimeout(() => {
            resultsAsYouType.classList.remove("dropdown-open");
		}, 200);
    }

    function handleKeydown(ev: KeyboardEvent) {
        if (!items?.length || !resultsAsYouType.classList.contains("dropdown-open")) return;
        
        // Find all focusable links inside the dropdown
        // Only target the item title links and the "See all results" button at the bottom
        const links = Array.from(resultsAsYouType.querySelectorAll('.dropdown-content a.font-semibold, .dropdown-content a.btn')) as HTMLAnchorElement[];
        if (links.length === 0) return;

        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            selectedIndex = (selectedIndex + 1) % links.length;
            links[selectedIndex].focus();
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            selectedIndex = (selectedIndex - 1 + links.length) % links.length;
            links[selectedIndex].focus();
        }
    }

	$: activeVaultName = $page.data.inventories?.find(i => i.id === $page.data.activeInventoryId)?.name;
	$: searchPlaceholder = activeVaultName ? `Search in ${activeVaultName}` : "Search";
</script>

<form method="GET" action="/search" class="w-full sm:w-auto relative">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={resultsAsYouType} id="resultsAsYouType" class="dropdown dropdown-end w-full md:w-auto" on:keydown={handleKeydown}>
        
        <div class="form-control relative w-full">
            <input 
                bind:value={q}
                on:focus={focus} 
                on:blur={blur} 
                on:input={(ev)=>query(ev, q)}
                autocomplete="off" 
                type="text" 
                name="q" 
				placeholder={searchPlaceholder} 
                class="input input-bordered md:w-64 w-full pr-10 bg-base-200/50 focus:bg-base-100 focus:shadow-inner transition-all duration-200 rounded-xl"
            />
            {#if q.length > 0}
                <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-base-content" on:click|preventDefault={() => { q = ''; query(new Event('input'), ''); document.querySelector('input[name="q"]')?.focus(); }} aria-label="Clear">
                    <i class="bi bi-x-circle-fill"></i>
                </button>
            {:else}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            {/if}
        </div>

        <DropdownPanel>
            {#if items?.length > 0}
				<div class="max-h-[35vh] sm:max-h-[50vh] overflow-y-auto rounded-xl overscroll-contain">
                    <Items items={items} brief={true} showControls={false} forceListView={true} />
                </div>
            {/if}
            <div class="{(items?.length > 0) ? 'mt-1 pt-1 border-t border-base-200/60' : ''} flex flex-col gap-1 sticky bottom-0 bg-base-100 z-10 pb-1">
                <a href="/search{q ? `?q=${encodeURIComponent(q)}` : ''}" class="btn btn-ghost btn-sm w-full text-primary hover:bg-primary/10 flex items-center justify-center gap-2 rounded-xl" on:click={() => resultsAsYouType.classList.remove("dropdown-open")}>
                    <i class="bi bi-search"></i> {q ? `See all results for "${q.replace(/^"|"$/g, '')}"` : 'Advanced Search & Bulk Edit'}
                </a>
            </div>
        </DropdownPanel>
    </div>
</form>

