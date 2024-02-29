<script lang="ts">
    import type { ActionData, PageServerData } from "./$types";
    import Alert from "$lib/components/alert.svelte";
    import { enhance } from "$app/forms";
  
    export let data: PageServerData;
    export let form: ActionData;

    import pageTitle from '$lib/stores';
    pageTitle.set("Edit container " + data.item?.name);
</script>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<form method="post" enctype="multipart/form-data" use:enhance>
    <input type="hidden" name="id" value="{data.item?.name}">

    <div class="mb-3">
        <input type="text" name="name" placeholder="Name" value="{data.item?.name}" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <input type="text" name="location" placeholder="Location" value="{data.item?.location}" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <input type="text" name="numtrays" placeholder="Number of trays" value="{data.item?.children.length}" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        {#if data.item?.photoPath}
            <img class="w-32 h-32" src="{data.item?.photoPath}"/>
        {/if}
        <input type="file" name="photoPath" accept="image/*" class="file-input w-full">
    </div>

    <div class="mb-3">
        <textarea name="description" rows="10" placeholder="description" class="textarea textarea-bordered w-full">{data.item?.description}</textarea>
    </div>

    <button type="submit" class="btn btn-primary">Update</button>
</form>