<script lang="ts">
    /*
     * Reason for having searching in here (as well) is that it is 
     * that 'search-as-you-type' is tied to the input field.
     */
    import Items from "$lib/components/items.svelte";

    export let q: string = '';

    let items = [];
    
    async function query(ev, q)
    {
        if(!q || q.length === 0) {
            items = [];
            return;
        }

        const res = await fetch(`/api/items?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        items = data.items;

        resultsAsYouType.classList.add("dropdown-open");
    }

    function focus(ev)
    {
        if(items.length > 0) {
            resultsAsYouType.classList.add("dropdown-open");
        }
    }

    function blur()
    {
        setTimeout(() => {
            resultsAsYouType.classList.remove("dropdown-open");
        }, 100);
    }
</script>

<form method="GET" action="/search">
    <div class="flex" style="flex-direction: column; align-items:left;">
        <div class="form-control items-end">
            <input on:focus={focus} on:blur={blur} autocomplete="off" on:input={(ev)=>query(ev, ev.target.value)} type="text" name="q" value="{q}" placeholder="Search" class="input input-bordered md:w-auto w-full join-item" />
            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-8 pr-2 absolute" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        <!-- search as you type -->
        {#if items?.length > 0}
            <div id="resultsAsYouType" class="dropdown border-solid dropdown-open">
                <div class="dropdown-content z-[1] menu p-2 shadow bg-slate-800 rounded-box grow w-96">
                    <Items items={items} brief={true}/>
                </div>
            </div>
        {/if}

    </div>
</form>

