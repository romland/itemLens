<script>
    import QRreader from "$lib/components/QRreader.svelte";
    import { createEventDispatcher, onMount } from 'svelte'
    const dispatch = createEventDispatcher();

    export let values = [];
    export let containers = [];
    // Kept for backward compatibility, but the tabbed layout solves the space issue natively!
    export let mini = false;

    let scanningContainers = false;
    let addedContainers = [];
    
    // View state for tabs
    let activeTab = 'scan'; // 'scan' | 'select'

    onMount(async () => {
        if(typeof window !== 'undefined' && values.length) {
            for(let i = 0; i < values.length; i++) {
                console.log("hum:", values[i].containerName);
                scannedContainer({detail: values[i].containerName}, "containers", false);
            }
        }
    });

    function isValidContainer(txt)
    {
        const containerRegExp = /(^[A-Z])|(\s[0-9]{3})/g
        return containerRegExp.test(txt) || `QR said ${txt}, QR should be ID such as 'B 003'`;
    }

    function scannedContainer(ev, inputEltName, notify = true)
    {
        const form = document.getElementById("eltForm");
        if (!form) return;
        
        const elt = form.elements[inputEltName];
        const options = Array.from(elt.querySelectorAll('option'));
        const option = options.find(c => c.value === ev.detail);

        if(!option) {
            console.warn("Undefined container: ", ev.detail);
            return;
        }

        if(option.selected === false) {
            addedContainers.push(ev.detail);
            addedContainers = addedContainers;
        }

        option.selected = true;

        if(notify) {
            dispatch("success", `Added container: ${ev.detail}`);
        }
    }
</script>

<div class="flex flex-col w-full">
    <!-- Tab Navigation -->
    <div role="tablist" class="tabs tabs-boxed bg-base-200/50 p-1 mb-4 w-full grid grid-cols-2 rounded-xl">
        <button 
            type="button" 
            role="tab" 
            class="tab h-10 transition-all {activeTab === 'scan' ? 'tab-active bg-base-100 shadow-sm font-semibold' : 'text-gray-500'}" 
            on:click={() => activeTab = 'scan'}
        >
            <i class="bi bi-qr-code-scan mr-2"></i> Scan QR
        </button>
        <button 
            type="button" 
            role="tab" 
            class="tab h-10 transition-all {activeTab === 'select' ? 'tab-active bg-base-100 shadow-sm font-semibold' : 'text-gray-500'}" 
            on:click={() => activeTab = 'select'}
        >
            <i class="bi bi-list-check mr-2"></i> Choose List
        </button>
    </div>

    <!-- Content Area -->
    <div class="bg-base-50/50 rounded-xl border-2 border-dashed border-base-300 p-6 min-h-[200px] flex flex-col transition-all">
        
        <!-- SCAN TAB -->
        <div class="flex flex-col items-center justify-center h-full w-full animate-fade-in" class:hidden={activeTab !== 'scan'}>
            {#if scanningContainers}
                <QRreader validator={isValidContainer} title="Scan QR-code on container" on:scan={(ev) => { scannedContainer(ev, "containers") } } on:stop={()=>{ scanningContainers=false }}></QRreader>
            {:else}
                <div class="bg-base-200 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="bi bi-box-seam text-2xl text-gray-500"></i>
                </div>
                <h3 class="font-semibold text-lg mb-1">Scan Container</h3>
                <p class="text-sm text-gray-400 text-center mb-4">Point your camera at a storage box QR code.</p>
                
                <button class="btn btn-primary btn-wide rounded-full shadow-sm" type="button" on:click={()=>{scanningContainers=true;}}>
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

        <!-- SELECT TAB -->
        <div class="flex flex-col h-full w-full animate-fade-in" class:hidden={activeTab !== 'select'}>
            <div class="flex items-center gap-3 mb-4">
                <div class="bg-base-200 w-10 h-10 rounded-full flex items-center justify-center">
                    <i class="bi bi-ui-checks text-gray-500"></i>
                </div>
                <div>
                    <h3 class="font-semibold">Manual Selection</h3>
                    <p class="text-xs text-gray-400">Select one or multiple locations</p>
                </div>
            </div>
            
            <!-- Kept in DOM so form submits and QR scanner can select options -->
            <select name="containers" class="select select-bordered w-full rounded-xl flex-grow font-mono" multiple="multiple" size="6">
                <option value="" disabled>Select one or more containers</option>
                {#each containers as container}
                    <option value="{container.name}" class="font-bold py-1">{container.name}: {container.description}</option>
                    {#if container.children.length > 0}
                        {#each container.children as child}
                            <option value="{child.name}" class="pl-6 py-1">
                                {child.name}
                                {#if child.description}
                                    - {child.description}
                                {/if}
                            </option>
                        {/each}
                    {/if}
                {/each}
            </select>
            <div class="mt-2 text-xs text-gray-400 text-center">
                Hold Ctrl (Windows) or Cmd (Mac) to select multiple.
            </div>
        </div>

    </div>
</div>