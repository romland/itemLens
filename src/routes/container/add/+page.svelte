<script lang="ts">
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";

    export let form: ActionData;

    import pageTitle from '$lib/stores';
    pageTitle.set("Add container");

</script>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}


<form method="post" enctype="multipart/form-data" use:enhance>
    <div class="mb-3">
        <input type="text" name="name" placeholder="Name" value="" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <input type="text" name="location" placeholder="Location" value="" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <input type="text" name="numtrays" placeholder="Number of trays" value="" class="input input-bordered w-1/3">
        <input type="text" name="starttray" placeholder="Start numbering with" value="1" class="input input-bordered w-1/3">
    </div>

    <div class="mb-3">
        <input type="file" name="photoPath" accept="image/*" class="file-input w-full">
    </div>

    <div class="mb-3">
        <textarea name="description" rows="10" placeholder="Description" class="textarea textarea-bordered w-full"></textarea>
    </div>

    <button type="submit" class="btn btn-primary">Save</button>
</form>
