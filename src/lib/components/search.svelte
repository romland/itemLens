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

        const res = await fetch(`/api/items?q=${encodeURIComponent(q)}&c=7`);
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
        // console.log("SHOULD BLUR") return;
        setTimeout(() => {
            resultsAsYouType.classList.remove("dropdown-open");
        }, 75);
    }
</script>

<form method="GET" action="/search">
    <div class="flex" style="flex-direction: column; align-items:left;">
        <div class="form-control items-end">
            <input 
                on:focus={focus} 
                on:blur={blur} 
                on:input={(ev)=>query(ev, ev.target.value)} 
                autocomplete="off" 
                type="text" 
                name="q" 
                value="{q}" 
                placeholder="Search" 
                class="input input-bordered md:w-auto w-full join-item"
            />
            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-8 pr-2 absolute" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        <!-- search as you type -->
        <!--
            TODO: I want the dropdown to take up all space on cellphones, 
                  added hack to align to end, and absolut pos to right.
                  Looks a bit awkward on non-mobile, but I actually do not
                  mind that it licks the right edge (and does not obscure 
                  other content)
        -->
        <div id="resultsAsYouType"
            class:hidden={items.length === 0}
            class="dropdown border-solid dropdown-open dropdown-end"
            style="position: absolute; right: 0; bottom: 0;"
        >
            <div class="dropdown-content z-[1] menu p-2 shadow bg-slate-800 rounded-box grow w-96">
                {#if items?.length > 0}
                    <Items items={items} brief={true}/>
                {/if}
            </div>
        </div>

    </div>
</form>

