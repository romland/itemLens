<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";
    import { enhance, type SubmitFunction } from '$app/forms';
    import { redirect } from '@sveltejs/kit';
    import Title from "$lib/components/Title.svelte";

    let saving = false;

    export let form: ActionData;
    const onSubmit: SubmitFunction = async (data) => {
        // if(canvasCameraUsed) {
        //     const blob = await new Promise(resolve => eltCanvas.toBlob(resolve));
        //     data.formData.set("file", blob, "item.png");
        // }
        saving = true;

        return async (options) => {
            // after the form submits...
            saving = false;
            console.log("saved:", options);
            if(options.result?.type === "redirect") {
                window.location.href = options.result.location;
            }
        }
    }
    
    var fileCounter = 1;
    function photoUploadChanged(ev)
    {
        console.log("Photo upload changed:", ev);
        if(ev.target.value) {
            // Take parent of file-select, clone it and make a new element
            // for further file-uploads. One could argue that one should use
            // multi-select, but that's not handy when camera is the source of
            // the file.
            const container = ev.target.parentNode;
            const newParent = container.cloneNode(true);
            const newInput = newParent.getElementsByTagName("input")[0];

            // Modify the new file-select
            newInput.name = "file." + fileCounter;
            newInput.value = "";

            // Make sure new file-select also calls in here when changed
            newInput.addEventListener("change", photoUploadChanged);

            // Modify new filetype-select
            newParent.querySelector("select").selectedIndex = 0;
            newParent.querySelector("select").name = `filetype.${fileCounter}`;

            // Modify new checkbox to say not being uploaded
            newParent.querySelector("input[type=checkbox]").checked = "";

            // Indicate that existing file is being uploaded
            container.querySelector("input[type=checkbox]").checked = "checked"

            // Insert the new element after the previous
            container.insertAdjacentElement("afterend", newParent);

            fileCounter++;
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
            <input on:change={photoUploadChanged} type="file" name="file.0" accept="image/*" capture="environment" class="file-input w-1/3">
            <select name="file.type.0" class="select select-bordered m-1">
                <option selected disabled>Set picture content</option>
                <option>Product</option>
                <option>Receipt</option>
                <option>Information</option>
                <option>QR Code</option>
                <option>Other</option>
            </select>
            <input type="checkbox" disabled="true" class="checkbox checkbox-lg ml-1 m-1" />
        </div>
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