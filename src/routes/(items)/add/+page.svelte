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

    let saving = false;
    let scanning = false;
    let alerts = [];

    export let form: ActionData;
    export let data: PageServerData;

    const onSubmit: SubmitFunction = async (data) => {
        saving = true;

        return async (options) => {
            // After the form submits...
            saving = false;
            console.log("saved:", options);
            if(options.result?.type === "redirect") {
                window.location.href = options.result.location;
            }
        }
    }
    
    var productPhotoFileCounter = 1;
    function productPhotoUploadChanged(ev)
    {
        if(ev.target.value) {
            // Take parent of file-select, clone it and make a new element
            // for further file-uploads. One could argue that one should use
            // multi-select, but that's not handy when camera is the source of
            // the file.
            const container = ev.target.parentNode;
            const newParent = container.cloneNode(true);
            const newInput = newParent.getElementsByTagName("input")[0];

            // Modify the new file-select
            newInput.name = "file." + productPhotoFileCounter;
            newInput.value = "";

            // Make sure new file-select also calls in here when changed
            newInput.addEventListener("change", productPhotoUploadChanged);

            // Modify new filetype-select
            newParent.querySelector("select").selectedIndex = 0;
            newParent.querySelector("select").name = `filetype.${productPhotoFileCounter}`;

            // Modify new checkbox to say not being uploaded
            newParent.querySelector("input[type=checkbox]").checked = "";

            // Indicate that existing file is being uploaded
            container.querySelector("input[type=checkbox]").checked = "checked"

            // Insert the new element after the previous
            container.insertAdjacentElement("afterend", newParent);

            productPhotoFileCounter++;
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
        scanning = false;
        document.getElementById("eltForm").elements[inputEltName].value += ev.detail + "\n";
        addAlert("success", `Added URL: ${ev.detail}`);
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

<svelte:head>
    <Title>Add new item</Title>
</svelte:head>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
    <div class="mb-3">
        <input type="text" name="title" value="" placeholder="Product name" class="input input-bordered w-full">
    </div>

    <div>
        <div class="mb-3 flex items-center">
            <input on:change={productPhotoUploadChanged} type="file" name="file.0" accept="image/*" capture="environment" class="file-input w-1/3">
            <select name="file.type.0" class="select select-bordered m-1">
                <option selected disabled>Select photo content</option>
                <option>Product</option>
                <option>Receipt</option>
                <option>Information</option>
                <option>Other</option>
            </select>
            <input type="checkbox" disabled="true" class="checkbox checkbox-lg ml-1 m-1" />
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
            <select class="select select-bordered w-full max-w-xs" multiple>
                <option disabled selected>Select one or more containers</option>
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
    {/if}

    <div class="mb-3">
        <textarea name="description" rows="5" placeholder="Product description" class="textarea textarea-bordered w-full"></textarea>
        <div class="mt-1 text-gray-400 text-xs">
            Markdown can be used.
        </div>
    </div>


    <div class="mb-3">
        {#if uploadPictureForQRcodes}
            <!-- Insert URLs using camera (QR codes), upload to server -->
            <input on:change={qrPhotoUploadChanged} type="file" name="qr.0" accept="image/*" capture="environment" class="file-input w-full">
        {:else}
            <!-- Use camera to scan QR codes (client side), results go into a form input -->
            {#if scanning}
                <QRreader validator={isValidURL} on:scan={(ev) => { scannedURL(ev, "urls") } } on:stop={()=>{ scanning=false }}></QRreader>
            {/if}

            <button class:disabled={scanning} class="btn btn-primary" type="button" on:click={()=>scanning=true}>Scan QR-code</button>
            <div>
                <textarea name="urls" rows="5" placeholder="URLs to related documents" class="textarea textarea-bordered w-full"></textarea>
            </div>

        {/if}
        <div class="mt-1 text-gray-400 text-xs">
            Add URLs with QR codes or paste (one per line). The documents will be downloaded, indexed and stored.
        </div>
    </div>

    <div class="mb-3">
        <input type="text" name="reason" value="" placeholder="Reason for purchase (project)" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <div>
            <input type="text" name="attributeKey[]" value="" placeholder="Attribute" class="input input-bordered w-1/3">
            <input type="text" name="attributeValue[]" value="" placeholder="Value" class="input input-bordered w-1/3">
            <button type="button" class="btn ">-</button>
        </div>
        <div class="mt-1 text-gray-400 text-xs">
            Attributes, e.g.: weight = 400g, width = 140mm
        </div>
    </div>

    <div class="mb-3">
        <input type="text" name="tagcsv" placeholder="Tags" class="input input-bordered w-full">
        <div class="mt-1 text-gray-400 text-xs">
            Seperated by comma.
        </div>
    </div>

    <div class="flex justify-end">
        <button disabled={saving} type="submit" class="btn btn-primary">{#if saving}<span class="loading loading-infinity loading-lg"></span>{:else}Save{/if}</button>
    </div>
</form>

{#if alerts.length > 0}
    {#each alerts as alert}
        <div role="alert" class="alert alert-{alert.status}">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{alert.message}</span>
        </div>
    {/each}
{/if}
