<script lang="ts">
    /*
     * Reason for having searching in here (as well) is that it is 
     * that 'search-as-you-type' is tied to the input field.
     */
    import Items from "$lib/components/items.svelte";

    export let q: string = '';
    let resultsAsYouType: HTMLDivElement;

    let items = [];
    
    async function query(ev: Event, q: string)
    {
        if(!q || q.length === 0) {
            items = [];
            return;
        }

        const res = await fetch(`/api/items?q=${encodeURIComponent(q)}&c=8&sort=newest`);
        const data = await res.json();
        items = data.items;

        resultsAsYouType.classList.add("dropdown-open");
    }

    function focus(ev: Event)
    {
		resultsAsYouType.classList.add("dropdown-open");
    }

    function blur()
    {
        // console.log("SHOULD BLUR") return;
        setTimeout(() => {
            resultsAsYouType.classList.remove("dropdown-open");
		}, 200);
    }
</script>

<form method="GET" action="/search" class="w-full sm:w-auto relative">
    <div bind:this={resultsAsYouType} id="resultsAsYouType" class="dropdown dropdown-end w-full md:w-auto">
        
        <div class="form-control relative w-full">
            <input 
                bind:value={q}
                on:focus={focus} 
                on:blur={blur} 
                on:input={(ev)=>query(ev, q)}
                autocomplete="off" 
                type="text" 
                name="q" 
                placeholder="Search" 
                class="input input-bordered md:w-64 w-full pr-10 bg-base-200/50 focus:bg-base-100 focus:shadow-inner transition-all duration-200 rounded-xl"
            />
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        <div class="dropdown-content mt-2 z-[999] w-[calc(100vw-2rem)] sm:w-[28rem] shadow-2xl shadow-black/30 bg-base-200/95 backdrop-blur-xl border border-base-300 rounded-2xl p-2 flex flex-col gap-1">
            {#if items?.length > 0}
                <div class="max-h-[60vh] overflow-y-auto rounded-xl">
                    <Items items={items} brief={true} showControls={false} forceListView={true} />
                </div>
            {/if}
            <div class="{(items?.length > 0) ? 'mt-1 pt-1 border-t border-base-200/60' : ''} flex flex-col gap-1">
                <a href="/search{q ? `?q=${encodeURIComponent(q)}` : ''}" class="btn btn-ghost btn-sm w-full text-primary hover:bg-primary/10 flex items-center justify-center gap-2 rounded-xl" on:click={() => resultsAsYouType.classList.remove("dropdown-open")}>
                    <i class="bi bi-search"></i> {q ? `See all results for "${q}"` : 'Advanced Search & Bulk Edit'}
                </a>
            </div>
        </div>
    </div>
</form>

