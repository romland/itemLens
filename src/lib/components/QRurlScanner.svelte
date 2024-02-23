<script>
    import QRreader from "$lib/components/QRreader.svelte";
    import { createEventDispatcher } from 'svelte'
    const dispatch = createEventDispatcher();

    export let mini = false;

    const uploadPictureForQRcodes = false;

    let scanningURLs = false;
    let addedURLs = [];

    var qrPhotoFileCounter = 1;
    function qrPhotoUploadChanged(ev)
    {
        if(ev.target.value) {
            const orgElt = ev.target;
            const newInput = orgElt.cloneNode(true);

            // Modify the new file-select
            newInput.name = "qr." + qrPhotoFileCounter;
            newInput.value = "";

            // Make sure new file-select also calls in here when changed
            newInput.addEventListener("change", qrPhotoUploadChanged);

            // Insert the new element after the previous
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

    {#if uploadPictureForQRcodes}
        <!-- Insert URLs using camera (QR codes), upload to server -->
        <input on:change={qrPhotoUploadChanged} type="file" name="qr.0" accept="image/*" capture="environment" class="file-input w-full">
    {:else}
        <!-- Use camera to scan QR codes (client side), results go into a form input -->
        {#if scanningURLs}
            <QRreader validator={isValidURL} title="Scan URL in QR-code" on:scan={(ev) => { scannedURL(ev, "urls") } } on:stop={()=>{ scanningURLs=false }}></QRreader>
        {/if}

        <button class:disabled={scanningURLs} class="btn btn-primary mb-3" type="button" on:click={()=>scanningURLs=true}>
            Scan URL (QR)
        </button>

        <div class:hidden={!mini}>
            {#if addedURLs.length > 0}
                <span>Fetching:</span>
                {#each addedURLs as url}
                    <div class="badge badge-neutral">{url}</div>
                {/each}
            {/if}
        </div>

        <div class:hidden={mini}>
            <textarea name="urls" rows="5" placeholder="URLs to related documents" class="textarea textarea-bordered w-full"></textarea>
        </div>
    {/if}
    <div class:hidden={mini} class="mt-1 text-gray-400 text-xs">
        Add URLs with QR-codes or paste (one per line). The documents will be downloaded, indexed and stored.
    </div>
