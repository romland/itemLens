<script>
    import QRreader from "$lib/components/QRreader.svelte";
    import { createEventDispatcher } from 'svelte'
    const dispatch = createEventDispatcher();

    // The mini prop is kept for backwards compatibility if used elsewhere, 
    // but the tabbed design naturally solves the mobile space issue!
    export let mini = false; 

    const uploadPictureForQRcodes = false;

    let scanningURLs = false;
    let addedURLs = [];
    
    // View state for tabs
    let activeTab = 'scan'; // 'scan' | 'paste'

    var qrPhotoFileCounter = 1;
    function qrPhotoUploadChanged(ev)
    {
        if(ev.target.value) {
            const orgElt = ev.target;
            const newInput = orgElt.cloneNode(true);

            newInput.name = "qr." + qrPhotoFileCounter;
            newInput.value = "";
            newInput.addEventListener("change", qrPhotoUploadChanged);
            orgElt.insertAdjacentElement("afterend", newInput);

            qrPhotoFileCounter++;
        }
    }

    function scannedURL(ev, inputEltName)
    {
        scanningURLs = false;

        if(!addedURLs.includes(ev.detail)) {
            document.getElementById("eltForm").elements[inputEltName].value += ev.detail + "\n";
            addedURLs.push(ev.detail);
            addedURLs = addedURLs;
        }
        dispatch("success", `Added URL: ${ev.detail}`);
    }

    function isValidURL(txt)
    {
        if(isURL(txt)) {
            return true;
        }
        return `QR-code should contain an URL.<br/>It contained: "${txt}"`;
    }

    function isURL(url)
    {
        const urlRegExp = /^(?:(?:https?|ftp):\/\/)?(?:\S+(?::\S*)?@)?(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?:\/[^\s]*)?$/i;
        return urlRegExp.test(url);
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
            class="tab h-10 transition-all {activeTab === 'paste' ? 'tab-active bg-base-100 shadow-sm font-semibold' : 'text-gray-500'}" 
            on:click={() => activeTab = 'paste'}
        >
            <i class="bi bi-link-45deg mr-2"></i> Paste Links
        </button>
    </div>

    <!-- Content Area -->
    <div class="bg-base-50/50 rounded-xl border-2 border-dashed border-base-300 p-6 min-h-[200px] flex flex-col transition-all">
        
        {#if uploadPictureForQRcodes}
            <!-- Legacy fallback if enabled -->
            <input on:change={qrPhotoUploadChanged} type="file" name="qr.0" accept="image/*" capture="environment" class="file-input w-full">
        {:else}
            
            {#if activeTab === 'scan'}
                <div class="flex flex-col items-center justify-center h-full animate-fade-in w-full">
                    
                    {#if scanningURLs}
                        <QRreader validator={isValidURL} title="Scan URL in QR-code" on:scan={(ev) => { scannedURL(ev, "urls") } } on:stop={()=>{ scanningURLs=false }}></QRreader>
                    {:else}
                        <div class="bg-base-200 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                            <i class="bi bi-phone text-2xl text-gray-500"></i>
                        </div>
                        <h3 class="font-semibold text-lg mb-1">Scan Document Link</h3>
                        <p class="text-sm text-gray-400 text-center mb-4">Use your camera to scan a QR code containing a web link.</p>
                        
                        <button class="btn btn-primary btn-wide rounded-full shadow-sm" type="button" on:click={()=>scanningURLs=true}>
                            <i class="bi bi-qr-code-scan mr-2"></i> Open Scanner
                        </button>
                    {/if}

                    {#if addedURLs.length > 0}
                        <div class="mt-4 w-full text-center">
                            <span class="text-sm text-gray-500 block mb-2">Ready to fetch:</span>
                            <div class="flex flex-wrap gap-2 justify-center">
                                {#each addedURLs as url}
                                    <div class="badge badge-primary badge-outline gap-1 p-3">
                                        <i class="bi bi-link"></i> {url}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="flex flex-col h-full animate-fade-in w-full">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="bg-base-200 w-10 h-10 rounded-full flex items-center justify-center">
                            <i class="bi bi-keyboard text-gray-500"></i>
                        </div>
                        <div>
                            <h3 class="font-semibold">Manual Entry</h3>
                            <p class="text-xs text-gray-400">Paste one URL per line</p>
                        </div>
                    </div>
                    
                    <textarea name="urls" rows="4" placeholder="https://example.com/manual.pdf&#10;https://example.com/specs" class="textarea textarea-bordered w-full rounded-xl flex-grow font-mono text-sm"></textarea>
                </div>
            {/if}
            
        {/if}
    </div>
    
    <div class="mt-3 text-gray-400 text-xs text-center flex items-center justify-center gap-1">
        <i class="bi bi-info-circle"></i> Linked documents will be downloaded, indexed, and stored forever.
    </div>
</div>