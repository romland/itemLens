<script lang="ts">
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";

    export let form: ActionData;

    import pageTitle from '$lib/stores';
    pageTitle.set("Add container");

    let mode: 'single' | 'batch' = 'single';
    let printLabel = false;
</script>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}


<form method="post" enctype="multipart/form-data" use:enhance class="flex flex-col gap-4 max-w-4xl mx-auto pb-8">
    <input type="hidden" name="mode" value={mode}>
    
    <!-- iOS-Style Segmented Control -->
    <div class="bg-base-200 p-1 rounded-xl flex w-full max-w-xs mx-auto mb-4">
        <button type="button" class="flex-1 btn btn-sm border-none {mode === 'single' ? 'bg-base-100 shadow-sm hover:bg-base-100' : 'btn-ghost hover:bg-base-300'}" on:click={() => mode = 'single'}>Single Box</button>
        <button type="button" class="flex-1 btn btn-sm border-none {mode === 'batch' ? 'bg-base-100 shadow-sm hover:bg-base-100' : 'btn-ghost hover:bg-base-300'}" on:click={() => mode = 'batch'}>Batch Trays</button>
    </div>

    <!-- Grid: 1 column on mobile, 2 columns on medium screens and up -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        
        <!-- Left Column: Core Identity -->
        <div class="flex flex-col gap-4">
            <div class="form-control">
                <label class="label"><span class="label-text font-semibold">Container Name</span></label>
                <input type="text" name="name" placeholder={mode === 'single' ? "e.g. Red 30x30 Cube" : "e.g. Shelf A"} class="input input-bordered w-full shadow-sm">
            </div>

            <div class="form-control">
                <label class="label"><span class="label-text font-semibold">Location</span></label>
                <input type="text" name="location" placeholder="e.g. Living Room Bookshelf" class="input input-bordered w-full shadow-sm">
            </div>

            {#if mode === 'batch'}
                <div class="flex gap-4">
                    <div class="form-control w-1/2">
                        <label class="label"><span class="label-text font-semibold">Number of trays</span></label>
                        <input type="number" name="numtrays" value="10" placeholder="10" min="1" class="input input-bordered w-full shadow-sm">
                    </div>
                    <div class="form-control w-1/2">
                        <label class="label"><span class="label-text font-semibold">Start number</span></label>
                        <input type="number" name="starttray" value="1" min="1" class="input input-bordered w-full shadow-sm">
                    </div>
                </div>
            {/if}
        </div>

        <!-- Right Column: Media & Extras -->
        <div class="flex flex-col gap-4">
            <div class="form-control">
                <label class="label"><span class="label-text font-semibold">Photo</span></label>
                <input type="file" name="photoPath" accept="image/*" class="file-input file-input-bordered w-full shadow-sm">
            </div>

            <div class="form-control">
                <label class="label"><span class="label-text font-semibold">Description</span></label>
                <textarea name="description" rows="2" placeholder="Optional notes..." class="textarea textarea-bordered w-full shadow-sm"></textarea>
            </div>
            
            <!-- Label Studio Stub -->
            <div class="form-control bg-base-200 rounded-xl p-4 mt-2 border border-base-300">
                <label class="label cursor-pointer justify-start gap-3 w-max p-0 mb-1">
                    <input type="checkbox" name="printLabel" bind:checked={printLabel} class="checkbox checkbox-primary" />
                    <span class="label-text font-semibold">Print physical label</span>
                </label>
                {#if printLabel}
                    <div class="flex gap-4 mt-3 pl-8">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="labelSize" value="small" class="radio radio-primary radio-sm" checked={mode === 'batch'} />
                            <span class="text-sm">Small (QR Only)</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="labelSize" value="large" class="radio radio-primary radio-sm" checked={mode === 'single'} />
                            <span class="text-sm">Large (QR + Name)</span>
                        </label>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <div class="mt-6 flex justify-end">
        <button type="submit" class="btn btn-primary w-full md:w-auto md:px-12">Save Container</button>
    </div>
</form>
