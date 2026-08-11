<script lang="ts">
    import QRreader from "$lib/components/QRreader.svelte";
    import { createEventDispatcher, onMount } from 'svelte'
    const dispatch = createEventDispatcher();

    export let values = [];
    export let containers = [];
    export let mini = false;
    // To satisfy Svelte -- mini is unused
    void mini;

    let scanningContainers = false;
    let addedContainers = [];
    let manualSelected = [];
    
    // View state for tabs
    let activeTab = 'scan'; // 'scan' | 'select'
    let searchQuery = '';

    // Flatten parent/child hierarchy for easier searching and displaying
    $: flatContainers = containers.reduce((acc, c) => {
        acc.push({ ...c, isChild: false });
        if (c.children && c.children.length > 0) {
            c.children.forEach(child => acc.push({ ...child, isChild: true, parent: c.name }));
        }
        return acc;
    }, []);
    $: filteredContainers = flatContainers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase())));

    // // Combine QR-scanned containers and manually selected ones
    // // and dispatch back to MobileAddHub to show on badges
    // $: allContainers = Array.from(new Set([...addedContainers, ...manualSelected]));

    // Prevent Svelte string-spread bug by forcing array, 
    // and strip spaces so "A 001" displays as "A001" on the pill
    $: safeManualSelected = Array.isArray(manualSelected) ? manualSelected : (manualSelected ? [manualSelected] : []);
    $: allContainers = Array.from(new Set([...addedContainers, ...safeManualSelected])).map(c => c.replace(/\s+/g, ''));
    $: dispatch('change', { containers: allContainers });

    onMount(async () => {
        if(typeof window !== 'undefined' && values.length) {
            for(let i = 0; i < values.length; i++) {
                scannedContainer({detail: values[i].containerName}, "containers", false);
            }
        }
    });

    function isValidContainer(txt)
    {
        // const containerRegExp = /(^[A-Z])|(\s[0-9]{3})/g
        // return containerRegExp.test(txt) || `QR said ${txt}, QR should be ID such as 'B 003'`;
        if (!txt || txt.trim() === '') return "Empty QR code";
        return true;
    }

    function scannedContainer(ev: any, inputEltName: string, notify = true)
    {
        /*
        const form = document.getElementById("eltForm");
        if (!form) return;
        
        const elt = (form as any).elements[inputEltName];
        const options = Array.from(elt.querySelectorAll('option')) as HTMLOptionElement[];
        const option = options.find(c => c.value === ev.detail);

        if(!option) {
            console.warn("Undefined container: ", ev.detail);
            return;
        }

        if(option.selected === false) {
            addedContainers = [...addedContainers, ev.detail];
        */
        if(!addedContainers.includes(ev.detail) && !manualSelected.includes(ev.detail)) {
            addedContainers = [...addedContainers, ev.detail];
        }

        // option.selected = true;

        if(notify) {
            dispatch("success", `Added container: ${ev.detail}`);
        }
    }
</script>

<div class="flex flex-col w-full">
    <!-- Hidden inputs to ensure scanned containers are submitted with the form -->
    {#each addedContainers as container}
        <input type="hidden" name="containers" value="{container}" />
    {/each}

    <!-- Tab Navigation -->
	<div role="tablist" class="flex bg-base-200/70 p-1 mb-4 w-full rounded-xl">
        <button 
            type="button" 
            role="tab" 
			class="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center flex-nowrap whitespace-nowrap {activeTab === 'scan' ? 'bg-base-100 shadow text-base-content' : 'text-gray-500 hover:text-gray-700'}"
            on:click={() => activeTab = 'scan'}
        >
            <i class="bi bi-qr-code-scan mr-2 whitespace-nowrap"></i> <span class="truncate">Scan QR</span>
        </button>
        <button 
            type="button" 
            role="tab" 
			class="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center flex-nowrap whitespace-nowrap {activeTab === 'select' ? 'bg-base-100 shadow text-base-content' : 'text-gray-500 hover:text-gray-700'}"
            on:click={() => activeTab = 'select'}
        >
            <i class="bi bi-list-check mr-2 whitespace-nowrap"></i> <span class="truncate">Manual</span>
        </button>
    </div>

    <!-- Content Area with tighter mobile padding -->
    <div class="bg-base-50/50 rounded-xl border-2 border-dashed border-base-300 p-2 sm:p-6 min-h-[200px] flex flex-col transition-all">
        
        <div class="flex flex-col items-center justify-center h-full w-full animate-fade-in" class:hidden={activeTab !== 'scan'}>
            {#if scanningContainers}
                <QRreader validator={isValidContainer} title="Scan QR-code on container" on:scan={(ev) => { scannedContainer(ev, "containers") } } on:stop={()=>{ scanningContainers=false }}></QRreader>
            {:else}
                <div class="bg-base-200 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="bi bi-box-seam text-2xl text-gray-500"></i>
                </div>
                <h3 class="font-semibold text-lg mb-1">Scan Container</h3>
                <p class="text-sm text-gray-400 text-center mb-4">Point your camera at a storage box QR code.</p>
                
                <button class="btn btn-primary btn-wide shadow-sm" type="button" on:click={()=>{scanningContainers=true;}}>
                    <i class="bi bi-qr-code-scan mr-2"></i> Open Scanner
                </button>
            {/if}

            {#if addedContainers.length > 0}
                <div class="mt-4 w-full text-center">
                    <span class="text-sm text-gray-500 block mb-2">Located in:</span>
                    <div class="flex flex-wrap gap-2 justify-center">
                        {#each addedContainers as container}
                            <div class="badge badge-primary badge-outline gap-1 p-3 font-mono">
                                <i class="bi bi-box"></i> {container}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

        <div class="flex flex-col h-full w-full animate-fade-in" class:hidden={activeTab !== 'select'}>
            <div class="flex items-center gap-3 mb-4 px-2">
                <div class="bg-base-200 w-10 h-10 rounded-full flex items-center justify-center shrink-0">
                    <i class="bi bi-ui-checks text-gray-500"></i>
                </div>
                <div>
                    <h3 class="font-semibold">Manual Selection</h3>
                    <p class="text-xs text-gray-400">Select one or multiple locations</p>
                </div>
            </div>
            
            <div class="form-control mb-3">
                <div class="input input-bordered flex items-center gap-2 rounded-xl shadow-sm">
                    <i class="bi bi-search text-gray-400"></i>
                    <input type="text" bind:value={searchQuery} placeholder="Search containers..." class="grow bg-transparent border-none focus:outline-none" />
                </div>
            </div>

            <div class="bg-base-100 border border-base-200 rounded-xl overflow-y-auto max-h-64 p-2 flex flex-col gap-1 shadow-inner">
                {#each filteredContainers as container}
                    <label class="flex items-center gap-3 p-3 hover:bg-base-200 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-base-300">
                        <input type="checkbox" name="containers" bind:group={manualSelected} value="{container.name}" class="checkbox checkbox-sm checkbox-primary" />
                        <div class="flex flex-col {container.isChild ? 'ml-6' : ''}">
                            <span class="font-semibold text-sm leading-none flex items-center gap-2">
                                {#if container.isChild}<i class="bi bi-arrow-return-right text-gray-400 text-xs"></i>{/if}
                                {container.name}
                            </span>
                            {#if container.description}
                                <span class="text-xs text-gray-500 mt-1 opacity-80">{container.description}</span>
                            {/if}
                        </div>
                    </label>
                {:else}
                    <div class="p-6 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
                        <i class="bi bi-inbox text-2xl"></i>
                        No containers found matching "{searchQuery}"
                    </div>
                {/each}
            </div>
        </div>

    </div>
</div>