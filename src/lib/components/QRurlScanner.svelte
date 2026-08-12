<script>
    import QRreader from "$lib/components/QRreader.svelte";
    import { createEventDispatcher } from 'svelte'
    const dispatch = createEventDispatcher();

    export const mini = false; 

    const uploadPictureForQRcodes = false;

    let scanningURLs = false;
    let addedURLs = [];
    
    // Premium Dynamic URL state
    let manualUrls = [{ id: 1, val: "" }];
    let nextUrlId = 2;
    
    // View state for tabs
    let activeTab = 'scan'; 

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

    function handleUrlInput() {
        const last = manualUrls[manualUrls.length - 1];
        if (last.val.trim() !== "") {
            manualUrls = [...manualUrls, { id: nextUrlId++, val: "" }];
        }
        
        const emptyCount = manualUrls.filter(u => u.val.trim() === "").length;
        if (emptyCount > 1) {
            const lastId = manualUrls[manualUrls.length - 1].id;
            manualUrls = manualUrls.filter(u => u.val.trim() !== "" || u.id === lastId);
        }
    }

    // Reactively combine QR URLs and Manual URLs for the hidden form input
    // and dispatch the count back to MobileAddHub
    $: compiledUrls = [
        ...addedURLs,
        ...manualUrls.map(u => u.val.trim()).filter(v => v !== "")
    ].join("\n");
    
    $: dispatch('change', { count: compiledUrls ? compiledUrls.split('\n').filter(x => x).length : 0 });

	let processedUrls = new Set();
	
	function triggerBackgroundProcessing(url) {
		url = url.trim();
		if (!url || !isURL(url) || processedUrls.has(url)) return;
		processedUrls.add(url);
		
		// Replaced client-side background processing with fire-and-forget server processing
		dispatch('processingComplete', { taskId: 'instant', status: 'success', message: '' });
	}

    function scannedURL(ev, inputEltName)
    {
        scanningURLs = false;
        if(!addedURLs.includes(ev.detail)) {
            addedURLs = [...addedURLs, ev.detail];
			triggerBackgroundProcessing(ev.detail);
        }
        dispatch("success", `Added URL: ${ev.detail}`);
    }

    function isValidURL(txt)
    {
        if(isURL(txt)) return true;
        return `QR-code should contain an URL.<br/>It contained: "${txt}"`;
    }

    function isURL(url)
    {
        const urlRegExp = /^(?:(?:https?|ftp):\/\/)?(?:\S+(?::\S*)?@)?(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?:\/[^\s]*)?$/i;
        return urlRegExp.test(url);
    }

    function removeScannedUrl(urlToRemove) {
        if (confirm(`Remove URL "${urlToRemove}"?`)) {
            addedURLs = addedURLs.filter(u => u !== urlToRemove);
        }
    }    
</script>

<div class="flex flex-col w-full">
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
			class="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center flex-nowrap whitespace-nowrap {activeTab === 'paste' ? 'bg-base-100 shadow text-base-content' : 'text-gray-500 hover:text-gray-700'}"
            on:click={() => activeTab = 'paste'}
        >
            <i class="bi bi-link-45deg mr-2 whitespace-nowrap"></i> <span class="truncate">Paste Links</span>
        </button>
    </div>

    <!-- Content Area with tighter mobile padding -->
    <div class="bg-base-50/50 rounded-xl border-2 border-dashed border-base-300 p-2 sm:p-6 min-h-[200px] flex flex-col transition-all">
        
        {#if uploadPictureForQRcodes}
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
                        <h3 class="font-semibold text-lg mb-1 text-center">Scan Document Link</h3>
                        <p class="text-sm text-gray-400 text-center mb-4">Use your camera to scan a QR code containing a web link.</p>
                        
                        <button class="btn btn-primary btn-wide shadow-sm" type="button" on:click={()=>scanningURLs=true}>
                            <i class="bi bi-qr-code-scan mr-2"></i> Open Scanner
                        </button>
                    {/if}

                    {#if addedURLs.length > 0}
                        <div class="mt-4 w-full text-center">
                            <span class="text-sm text-gray-500 block mb-2">Ready to fetch:</span>
                            <div class="flex flex-wrap gap-2 justify-center">
                                {#each addedURLs as url}
                                    <button type="button" class="badge badge-primary badge-outline gap-1 p-3 hover:bg-error hover:border-error hover:text-error-content transition-colors cursor-pointer text-left" on:click={() => removeScannedUrl(url)} title="Remove URL">
                                        <i class="bi bi-link"></i> <span class="truncate max-w-[200px]">{url}</span> <i class="bi bi-x ml-1 opacity-70 text-lg leading-none -mr-1"></i>
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="flex flex-col h-full animate-fade-in w-full">
                    <div class="flex items-center gap-3 mb-4 px-2">
                        <div class="bg-base-200 w-10 h-10 rounded-full flex items-center justify-center shrink-0">
                            <i class="bi bi-keyboard text-gray-500"></i>
                        </div>
                        <div>
                            <h3 class="font-semibold">Manual Entry</h3>
                            <p class="text-xs text-gray-400">Paste or type links below</p>
                        </div>
                    </div>
                    
                    <div class="flex flex-col gap-2">
                        {#each manualUrls as urlBox (urlBox.id)}
                            <input 
                                type="url" 
                                placeholder="https://..." 
                                class="input input-bordered w-full rounded-xl"
                                bind:value={urlBox.val}
                                on:input={handleUrlInput}
								on:blur={() => triggerBackgroundProcessing(urlBox.val)}
                            >
                        {/each}
                    </div>
                </div>
            {/if}
            
        {/if}
    </div>
    
    <!-- Unified hidden input for form submission -->
    <input type="hidden" name="urls" value={compiledUrls} />
    
    <div class="mt-3 text-gray-400 text-xs text-center flex items-center justify-center gap-1">
        <i class="bi bi-info-circle"></i> Linked documents will be downloaded, indexed, and stored forever.
    </div>
</div>