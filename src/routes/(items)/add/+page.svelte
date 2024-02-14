<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";
    import { enhance, type SubmitFunction } from '$app/forms';
    import { redirect } from '@sveltejs/kit';
    import Title from "$lib/components/Title.svelte";

    export let form: ActionData;
    const onSubmit: SubmitFunction = async (data) => {
        // if(canvasCameraUsed) {
        //     const blob = await new Promise(resolve => eltCanvas.toBlob(resolve));
        //     data.formData.set("file", blob, "item.png");
        // }

        return async (options) => {
            // after the form submits...
            console.log("saved:", options);
            if(options.result?.type === "redirect") {
                window.location.href = options.result.location;
            }
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
    <div class="mb-3">
        <input type="text" name="title" value="Default name" placeholder="Title" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <!--input id="eltFileInput" type="file" name="file" accept="image/*" class="file-input w-full"-->
        <input id="eltFileInput" type="file" name="file" accept="image/*" capture="environment" class="file-input w-full">
    </div>

    <div class="mb-3">
        <textarea name="content" rows="5" placeholder="Content" class="textarea textarea-bordered w-full"></textarea>
    </div>

    <div class="mb-3">
        <input type="text" name="tagcsv" placeholder="Tags" class="input input-bordered w-full">
        <div class="mt-1 text-gray-400 text-xs">
            Seperated by comma.
        </div>
    </div>

    <button type="submit" class="btn btn-primary">Save</button>
</form>
