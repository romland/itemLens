<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";
    import { enhance, type SubmitFunction } from '$app/forms';
    import { redirect } from '@sveltejs/kit';
    import Title from "$lib/components/Title.svelte";

    let saving = false;

    export let form: ActionData;
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


</script>

<svelte:head>
    <Title>Add new item</Title>
</svelte:head>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
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

    <h3>Locations</h3>

    <div class="mb-3 overflow-x-auto">
        <table class="table">
            <tbody>
                <!-- row 1 -->
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
                                    <img src="/images/containers/A_crop.png" alt="Container" />
                                </div>
                            </div>
                            <div>
                                <div class="font-bold">A</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        Zemlak, Daniel and Leannon
                        <br/>
                        <span class="badge badge-ghost badge-sm">Desktop Support Technician</span>
                    </td>
                    <td>Purple</td>
                    <th>
                        <button class="btn btn-ghost btn-xs">details</button>
                    </th>
                </tr>

            </tbody>
        </table>
    </div>


    <div class="mb-3">
        <input type="text" name="title" value="A default name" placeholder="Title" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <textarea name="description" rows="5" placeholder="Description" class="textarea textarea-bordered w-full"></textarea>
        <div class="mt-1 text-gray-400 text-xs">
            Markdown can be used.
        </div>
    </div>

    <div role="tablist" class="tabs tabs-bordered">
        <input type="radio" name="my_tabs_1" role="tab" class="tab" aria-label="Using camera" checked/>
        <div role="tabpanel" class="tab-content p-10">
            <!-- Insert URLs using camera (QR codes) -->
            <div class="mb-3">
                <input on:change={qrPhotoUploadChanged} type="file" name="qr.0" accept="image/*" capture="environment" class="file-input w-full">

                <div class="mt-1 text-gray-400 text-xs">
                    Add webpages with QR codes, documents will be downloaded, indexed and stored locally
                </div>
            </div>
        </div>
        <input type="radio" name="my_tabs_1" role="tab" class="tab" aria-label="Using keyboard" />
        <div role="tabpanel" class="tab-content p-10">
            <!-- Paste in URLs in textarea -->
            <div class="mb-3">
                <textarea name="urls" rows="5" placeholder="URLs to related documents" class="textarea textarea-bordered w-full"></textarea>
                <div class="mt-1 text-gray-400 text-xs">
                    One webpage per line, they will be downloaded, indexed and stored locally.
                </div>
            </div>
        </div>
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
