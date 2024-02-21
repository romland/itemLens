<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";
    import { enhance, type SubmitFunction } from '$app/forms';
    import { redirect } from '@sveltejs/kit';
    import Title from "$lib/components/Title.svelte";
    import type { PageServerData } from "./$types";
    import QRreader from "$lib/components/QRreader.svelte";

    const LARGE_CONTAINER_SELECTOR = false;
    const uploadPictureForQRcodes = false;
    const photoTypes = ["Product", "Invoice or receipt", "Information", "Other"];

    // Extended mode (false)
    let mobileDeviceMode = false;

    let saving = false;
    let scanningContainers = false;
    let scanningURLs = false;
    let alerts = [];
    let addedPhotoFilenames = [], addedContainers = [], addedURLs = [];
    let numKVPs = 1;

    export let form: ActionData;
    export let data: PageServerData;

    const onSubmit: SubmitFunction = async (data) => {
        saving = true;

        return async (options) => {
            // After the form submits...
            saving = false;
            if(options.result?.type === "redirect") {
                window.location.href = options.result.location;
            }
        }
    }
    
    var productPhotoFileCounter = 1;
    function productPhotoUploadChanged(ev)
    {

// quick test
// document.getElementById("eltForm").elements["title"].value = "A new product";
// document.getElementById("eltForm").elements["description"].value = "Yada yada";
// scannedContainer({detail:"A 001"}, "containers");
// scannedContainer({detail:"A 003"}, "containers");
// scannedURL({detail:"http://example.com"}, "urls");
// quick test

        if(ev.target.files[0]) {
            // Take parent of file-select, clone it and make a new element
            // for further file-uploads. One could argue that one should use
            // multi-select, but that's not handy when camera is the source of
            // the file.
            const container = ev.target.parentNode;
            const newParent = container.cloneNode(true);
            const newInput = newParent.getElementsByTagName("input")[0];

            // Modify the new file-select
            newInput.name = "file." + productPhotoFileCounter;
            newInput.id = newInput.name;
            newInput.value = "";

            // Add event: Make sure new file-select also calls in here when changed
            newInput.addEventListener("change", productPhotoUploadChanged);

            // Loop through each <li> element and add a click event listener
            const listItems = newParent.querySelectorAll('li');
            listItems.forEach((item) => {
                // Make sure we make a copy of the original as it might increase.
                const prodPhotoId = productPhotoFileCounter;
                item.addEventListener('click', (ev) => {
                    newParent.querySelector(`input[type='file']`)?.click();
                    document?.activeElement?.blur();

                    // Set name and avalue of the hidden input for type of file (product, receipt, ...)
                    const photoTypeElt = ev.target.parentNode.parentNode.parentNode.parentNode.querySelector("input[type='hidden']");
                    photoTypeElt.name = "file.type." + prodPhotoId;
                    photoTypeElt.value = ev.target.text.toLowerCase();
                });
            });

            // Hide the original
            container.classList.add("hidden");

            // Insert the new element after the previous
            container.insertAdjacentElement("afterend", newParent);

            productPhotoFileCounter++;

            addedPhotoFilenames.push({
                type: container.querySelector("input[type='hidden']").value,
                name: ev.target.files[0].name
            });
            addedPhotoFilenames = addedPhotoFilenames;
            addAlert("success", `Added photo: ${ev.target.files[0].name}`);
        }
    }

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

    function addAlert(status, message)
    {
        alerts.push( { status, message } );
        // NOTE: Without this self-assignment (which I tend to forget), when pushed through, 
        //       the #if blocks throw an awkward error:
        //       if_block1.p is not a function.
        //       (back in the day ... nothing would happen without it)
        alerts = alerts;
        setTimeout(() => {
            alerts.shift();
            alerts = alerts;
        }, 3000)
    }

    function scannedURL(ev, inputEltName)
    {
        scanningURLs = false;

        if(!addedURLs.includes(ev.detail)) {
            document.getElementById("eltForm").elements[inputEltName].value += ev.detail + "\n";
            addedURLs.push(ev.detail);
            addedURLs = addedURLs;
        }
        addAlert("success", `Added URL: ${ev.detail}`);
    }

    function scannedContainer(ev, inputEltName)
    {
        const elt = document.getElementById("eltForm").elements[inputEltName];
        const options = Array.from(elt.querySelectorAll('option'));

        const option = options.find(c => c.value === ev.detail);

        if(option.selected === false) {
            addedContainers.push(ev.detail);
            addedContainers = addedContainers;
        }

        option.selected = true;
        addAlert("success", `Added container: ${ev.detail}`);
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

    function isValidContainer(txt)
    {
        const containerRegExp = /(^[A-Z])|(\s[0-9]{3})/g
        return containerRegExp.test(txt) || `QR said ${txt}, QR should be ID such as 'B 003'`;
    }


    function addKVP(ev, ix)
    {
        numKVPs = numKVPs + 1;
    }

    function removeKVP(ev, ix)
    {
        if(numKVPs > 1) {
            ev.target.parentNode.remove("kvpK-"+ix);
            ev.target.parentNode.remove("kvpV-"+ix);
            numKVPs = numKVPs;
        }
    }

</script>

<svelte:head>
    <Title>Add new item</Title>
</svelte:head>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}


<div class="flex justify-items mb-3">
    Extended <input type="checkbox" class="toggle ml-2 mr-2" checked on:change={()=>mobileDeviceMode = !mobileDeviceMode} /> Brief mode
</div>

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
    <div class="mb-3">
        <input type="text" name="title" value="" placeholder="Product name" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <textarea name="description" rows="5" placeholder="Product description" class="textarea textarea-bordered w-full"></textarea>
        <div class="mt-1 text-gray-400 text-xs">
            Markdown can be used.
        </div>
    </div>

    <div class="mb-3">
        <!-- Note: this element will be cloned and inserted for every photo added -->
        <div>
            <input type="file" id="file.0" name="file.0" on:change={productPhotoUploadChanged} style="position:absolute; top:-999px;" accept="image/*" capture="environment" class="file-input mb-3">
            <input type="hidden" name="file.type.0" value="">

            <div class="dropdown">
                <div tabindex="0" role="button" class="btn-primary btn m-1">
                    Tap to add photo(s) of...
                </div>
                <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box">
                    {#each photoTypes as type}
                        <li on:click={ (ev) => {
                                document?.getElementById('file.0')?.click();
                                document?.activeElement?.blur();
                                ev.target.parentNode.parentNode.parentNode.parentNode.querySelector("input[type='hidden']").value = ev.target.text.toLowerCase();
                            }}>
                            <a>{type}</a>
                        </li>
                    {/each}
                </ul>
            </div>
        </div>

        <div>
            {#if addedPhotoFilenames.length > 0}
                <span>Uploading:</span>
                {#each addedPhotoFilenames as photo}
                    <div class="badge badge-neutral">{photo.name} ({photo.type})</div>
                {/each}
            {/if}
        </div>
    </div>

    {#if LARGE_CONTAINER_SELECTOR}
        <div class="mb-3" style="max-height: 20vh; overflow-y: scroll;">
            <table class="table">
                <tbody>
                    {#each data.containers as container}
                        <tr>
                            <th>
                                <label>
                                    <input name="locations" value="1" type="checkbox" class="checkbox" />
                                </label>
                            </th>
                            <td>
                                <div class="flex items-center gap-3">
                                    <div class="avatar">
                                        <div class="mask mask-square w-12 h-12">
                                            <img src="{container.photoPath}" alt="Container" class="hover:scale-125 transition duration-500 cursor-pointer"/>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="font-bold">{container.name}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                {#if container.children.length > 0}
                                    <select class="select select-bordered w-full max-w-xs" multiple>
                                        <option disabled selected>Tray</option>
                                        {#each container.children as child}
                                            <option>{child.name}</option>
                                        {/each}
                                    </select>
                                {/if}
                            </td>
                            <th>
                                <label>
                                    {container.location}<br/>
                                </label>
                            </th>
                            <th>
                                <label>
                                    {container.description}<br/>
                                </label>
                            </th>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <div class="mb-3">
            <!-- Use camera to scan QR codes on containers, results go into a form input -->
            {#if scanningContainers}
                <QRreader validator={isValidContainer} title="Scan QR-code on container" on:scan={(ev) => { scannedContainer(ev, "containers") } } on:stop={()=>{ scanningContainers=false }}></QRreader>
            {/if}

            <button class:disabled={scanningContainers} class="btn btn-primary" type="button" on:click={()=>{scanningContainers=true;}}>
                Scan container (QR)
            </button>

            <div class:hidden={!mobileDeviceMode}>
                {#if addedPhotoFilenames.length > 0}
                    <span>Located in:</span>
                    {#each addedContainers as container}
                        <div class="badge badge-neutral">{container}</div>
                    {/each}
                {/if}
            </div>

            <div class:hidden={mobileDeviceMode}>
                <select name="containers" class="select select-bordered w-full max-w-xs" multiple="multiple">
                    <option disabled>Select one or more containers</option>
                    {#each data.containers as container}
                        <option value="{container.name}">{container.name}: {container.description}</option>
                        {#if container.children.length > 0}
                            {#each container.children as child}
                                <option value="{child.name}" class="ml-4">{child.name}</option>
                            {/each}
                        {/if}
                    {/each}
                </select>
            </div>
        </div>
    {/if}

    <div class="mb-3">
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

            <div class:hidden={!mobileDeviceMode}>
                {#if addedURLs.length > 0}
                    <span>Fetching:</span>
                    {#each addedURLs as url}
                        <div class="badge badge-neutral">{url}</div>
                    {/each}
                {/if}
            </div>

            <div class:hidden={mobileDeviceMode}>
                <textarea name="urls" rows="5" placeholder="URLs to related documents" class="textarea textarea-bordered w-full"></textarea>
            </div>

        {/if}
        <div class:hidden={mobileDeviceMode} class="mt-1 text-gray-400 text-xs">
            Add URLs with QR-codes or paste (one per line). The documents will be downloaded, indexed and stored.
        </div>
    </div>

    <div class:hidden={mobileDeviceMode} class="mb-3">
        <input type="text" name="amount" value="" placeholder="Number of items" class="input input-bordered w-full">
    </div>

    <div class:hidden={mobileDeviceMode} class="mb-3">
        <input type="text" name="reason" value="" placeholder="Reason for purchase (project)" class="input input-bordered w-full">
    </div>

    <div class:hidden={mobileDeviceMode} class="mb-3">
        {#each {length:numKVPs} as _, i}
            <div>
                <input type="text" name="kvpK-{i}" value="" placeholder="Attribute" class="input input-bordered w-1/3 mb-3">
                <input type="text" name="kvpV-{i}" value="" placeholder="Value" class="input input-bordered w-1/3 mb-3">
                <button on:click={(ev)=>{ removeKVP(ev, i) }} type="button" class="btn btn-warning">-</button>
            </div>
        {/each}
        <button on:click={addKVP} type="button" class="btn btn-primary">+</button>
        <div class="mt-1 text-gray-400 text-xs">
            Attributes, e.g.: weight = 400g, width = 140mm
        </div>
    </div>

    <div class:hidden={mobileDeviceMode} class="mb-3">
        <input type="text" name="tagcsv" placeholder="Tags" class="input input-bordered w-full">
        <div class="mt-1 text-gray-400 text-xs">
            Seperated by comma.
        </div>
    </div>

    <div class="flex justify-end">
        <button disabled={saving} type="submit" class="btn btn-primary">{#if saving}<span class="loading loading-infinity loading-lg"></span>Uploading and saving{:else}Save{/if}</button>
    </div>
</form>

{#if alerts.length > 0}
    <div style="position: absolute; top: 0; left: 0;" class="w-full">
        {#each alerts as alert}
            <div role="alert" class="alert alert-{alert.status} md-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{alert.message}</span>
            </div>
        {/each}
    </div>
{/if}
