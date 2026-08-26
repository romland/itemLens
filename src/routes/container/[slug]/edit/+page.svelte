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

<form method="post" enctype="multipart/form-data" use:enhance class="flex flex-col gap-5 max-w-2xl mx-auto pb-8 mt-4">
    <input type="hidden" name="id" value="{data.item?.name}">

    <div class="form-control">
        <label class="label" for="name"><span class="label-text font-semibold">Container Name</span></label>
        <input type="text" id="name" name="name" value="{data.item?.name}" class="input input-bordered w-full shadow-sm">
        <div class="label"><span class="label-text-alt text-warning font-semibold"><i class="bi bi-exclamation-triangle"></i> Changing the name will break existing physical QR codes printed for this container.</span></div>
    </div>

    <div class="form-control">
        <label class="label" for="location"><span class="label-text font-semibold">Location</span></label>
        <input type="text" id="location" name="location" placeholder="e.g. Living Room Bookshelf" value="{data.item?.location}" class="input input-bordered w-full shadow-sm">
    </div>

    <div class="form-control">
        <label class="label" for="numtrays"><span class="label-text font-semibold">Number of Child Trays</span></label>
        <input type="text" id="numtrays" name="numtrays" value="{data.item?.children?.length || 0}" class="input input-bordered w-full shadow-sm bg-base-200 text-base-content/60 cursor-not-allowed" readonly>
        <div class="label"><span class="label-text-alt text-gray-500">Child trays are read-only and must be edited individually.</span></div>
    </div>

    <div class="form-control">
        <label class="label" for="photoPath"><span class="label-text font-semibold">Photo</span></label>
        {#if data.item?.photoPath}
            <div class="mb-3">
                <img class="w-32 h-32 object-cover rounded-xl border border-base-300 shadow-sm" src="{data.item?.photoPath}" alt="Container thumbnail"/>
            </div>
        {/if}
        <input type="file" id="photoPath" name="photoPath" accept="image/*" class="file-input file-input-bordered w-full shadow-sm">
    </div>

    <div class="form-control">
        <label class="label" for="description"><span class="label-text font-semibold">Description</span></label>
        <textarea id="description" name="description" rows="4" placeholder="Optional notes about what goes in here..." class="textarea textarea-bordered w-full shadow-sm leading-relaxed">{data.item?.description}</textarea>
    </div>

    <div class="mt-2 flex justify-end">
        <button type="submit" class="btn btn-primary w-full sm:w-auto sm:px-12 shadow-sm">Save Changes</button>
    </div>
</form>