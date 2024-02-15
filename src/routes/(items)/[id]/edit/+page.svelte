<script lang="ts">
    import type { ActionData, PageServerData } from "./$types";
    import Alert from "$lib/components/alert.svelte";
    import { enhance } from "$app/forms";
    import Title from "$lib/components/Title.svelte";
  
    export let data: PageServerData;
    export let form: ActionData;
</script>

<svelte:head>
    <Title>Edit Item</Title>
</svelte:head>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<form method="post" enctype="multipart/form-data" use:enhance>
    <input type="hidden" name="id" value="{data.item?.id}">
    <div class="mb-3">
        <input type="text" name="title" placeholder="Title" value="{data.item?.title}" class="input input-bordered w-full">
    </div>
    <div class="mb-3">
        <input type="file" name="file" accept="image/jpeg" class="file-input w-full">
    </div>
    <div class="mb-3">
        <textarea name="content" rows="10" placeholder="Content" class="textarea textarea-bordered w-full">{data.item?.content}</textarea>
    </div>
    <div class="mb-3">
        <input type="text" name="tagcsv" placeholder="Tags" value="{data.item?.tagcsv}" class="input input-bordered w-full">
        <div class="mt-1 text-gray-400 text-xs">
            Seperated by comma.
        </div>
    </div>
    <button type="submit" class="btn btn-primary">Update</button>
</form>