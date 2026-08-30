<script lang="ts">
    import type { ActionData, PageServerData } from "./$types";
    import Alert from "$lib/components/alert.svelte";
    import { enhance } from "$app/forms";
    import FormInput from "$lib/components/FormInput.svelte";
  
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

    <FormInput label="Container Name" id="name" name="name" value={data.item?.name} inputClass="shadow-sm" hint="<span class='text-warning font-semibold'><i class='bi bi-exclamation-triangle'></i> Changing the name will break existing physical QR codes printed for this container.</span>" />

    <FormInput label="Location" id="location" name="location" placeholder="e.g. Living Room Bookshelf" value={data.item?.location} inputClass="shadow-sm" />

    <FormInput label="Number of Child Trays" id="numtrays" name="numtrays" value={data.item?.children?.length || 0} inputClass="shadow-sm bg-base-200 text-base-content/60 cursor-not-allowed" readonly hint="Child trays are read-only and must be edited individually." />

        {#if data.item?.photoPath}
            <div class="mb-3">
                <img class="w-32 h-32 object-cover rounded-xl border border-base-300 shadow-sm" src="{data.item?.photoPath}" alt="Container thumbnail"/>
            </div>
        {/if}
    <FormInput type="file" label="Photo" id="photoPath" name="photoPath" accept="image/*" inputClass="shadow-sm" />

    <FormInput type="textarea" label="Description" id="description" name="description" rows="4" placeholder="Optional notes about what goes in here..." value={data.item?.description} inputClass="shadow-sm leading-relaxed" />

    <div class="mt-2 flex justify-end">
        <button type="submit" class="btn btn-primary w-full sm:w-auto sm:px-12 shadow-sm">Save Changes</button>
    </div>
</form>
