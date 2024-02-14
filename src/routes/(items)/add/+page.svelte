<script lang="ts">
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";
    import { enhance, type SubmitFunction } from '$app/forms';
    import { redirect } from '@sveltejs/kit';
    import Title from "$lib/components/Title.svelte";

    export let form: ActionData;

</script>

<svelte:head>
    <Title>Add New Item</Title>
</svelte:head>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
    <div class="mb-3">
        <input type="text" name="title" value="Default name" placeholder="Title" class="input input-bordered w-full">
    </div>
    {#if !cameraUsed}
        <div class="mb-3">
            <!--input id="eltFileInput" type="file" name="file" accept="image/*" class="file-input w-full"-->
            <input id="eltFileInput" type="file" name="file" accept="image/*" capture="environment" class="file-input w-full">
        </div>
    {:else}
        <canvas id="eltPreviewCanvas" style="width:{eltCanvas.width * 0.25}px; height:{eltCanvas.height * 0.25}px;" />
    {/if}
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
