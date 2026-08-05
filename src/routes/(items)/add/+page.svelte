<script lang="ts">
    import type { ActionData } from "./$types";
    import type { PageServerData } from "./$types";

    import { tick }  from 'svelte';
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import { redirect } from '@sveltejs/kit';
    import { photoTypes } from "$lib/shared/constants";

    import Alert from "$lib/components/alert.svelte";
    import QRreader from "$lib/components/QRreader.svelte";
    import MultiImageUpload from "$lib/components/MultiImageUpload.svelte";
    import MultiImageFetcher from "$lib/components/MultiImageFetcher.svelte";
    import ContainerSelector from "$lib/components/ContainerSelector.svelte";
    import ContainerSelectorLarge from "$lib/components/ContainerSelectorLarge.svelte";
    import QRurlScanner from "$lib/components/QRurlScanner.svelte";
    import Notifications from "$lib/components/Notifications.svelte";
    import AttributeAdder from "$lib/components/AttributeAdder.svelte";

    import pageTitle from '$lib/stores';
    import MediaHub from "$lib/components/add/MediaHub.svelte";
    import PasteHandler from "$lib/components/PasteHandler.svelte";

    import MobileAddHub from "$lib/components/add/MobileAddHub.svelte";

    import { onMount } from 'svelte';

    const LARGE_CONTAINER_SELECTOR = false;

    let minimalInput = true;
    let saving = false;
    let notifications: any[] = [];

    export let form: ActionData;
    export let data: PageServerData;

    const onSubmit: SubmitFunction = async (data) => {
        saving = true;

        return async (options) => {
            // After the form submits...
            saving = false;
            if(options.result?.type === "redirect") {
                window.location.href = options.result.location;
            }
        }
    }
    
    function notify(status: string, message: string) {
        notifications.push( { status, message } );
        notifications = notifications;
        setTimeout(() => {
            notifications.shift();
            notifications = notifications;
        }, 3000)
    }

    const toggleMinimal = () => {
        if(typeof window !== 'undefined') {
            minimalInput = window.innerWidth <= 768; // Adjusted to 768px to cover tablets/iPads
        }
    }
    
    // Call it once on load
    // toggleMinimal();
    onMount(() => {
        toggleMinimal();
    });

    $: console.log("Form changed:", form);

    pageTitle.set("Add new product");
</script>

<svelte:window onresize={toggleMinimal} />

<PasteHandler formId="eltForm" on:success={(ev) => notify("success", ev.detail)} />

{#if form?.error}
    <div class="mb-6">
        <Alert>{@html form?.message}</Alert>
    </div>
{/if}

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
    
    {#if minimalInput}
        <!-- PREMIUM MOBILE EXPERIENCE -->
        <MobileAddHub 
            containers={data.containers} 
            saving={saving} 
            on:success={(ev) => notify("success", ev.detail)} 
        />
    {:else}
        <!-- DESKTOP GRID EXPERIENCE -->
        
        <!-- Form Header Controls -->
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-semibold hidden md:block">Item Details</h2>
            <label class="cursor-pointer label bg-base-200 rounded-lg px-4 py-2 shadow-sm gap-3 w-full md:w-auto justify-center">
                <span class="label-text font-medium text-gray-500">Brief Mode</span> 
                <input type="checkbox" class="toggle toggle-primary" bind:checked={minimalInput} />
                <span class="label-text font-medium text-primary">Extended</span>
            </label>
        </div>
        
        <!-- CSS Grid: 12-column grid on large screens -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            <!-- LEFT COLUMN: Core Information (takes 7 columns on desktop) -->
            <div class="lg:col-span-7 flex flex-col gap-6">
                
                <div class="card bg-base-100 shadow-sm border border-base-200">
                    <div class="card-body">
                        <div class="form-control w-full mb-4">
                            <label class="label"><span class="label-text font-semibold">Product Name</span></label>
                            <input type="text" name="title" value="" placeholder="e.g. Logitech MX Master 3" class="input input-bordered w-full">
                        </div>

                        <div class="form-control w-full">
                            <label class="label"><span class="label-text font-semibold">Description</span></label>
                            <textarea name="description" rows="5" placeholder="Enter product details..." class="textarea textarea-bordered w-full"></textarea>
                            <label class="label"><span class="label-text-alt text-gray-400">Markdown is supported.</span></label>
                        </div>
                    </div>
                </div>

                <!-- Extended Fields -->
                <div class="card bg-base-100 shadow-sm border border-base-200">
                    <div class="card-body">
                        <h3 class="font-semibold mb-4 text-lg border-b pb-2">Additional Details</h3>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div class="form-control w-full">
                                <label class="label"><span class="label-text font-semibold">Amount / Quantity</span></label>
                                <input type="text" name="amount" value="" placeholder="e.g. 1" class="input input-bordered w-full">
                            </div>

                            <div class="form-control w-full">
                                <label class="label"><span class="label-text font-semibold">Reason for purchase</span></label>
                                <input type="text" name="reason" value="" placeholder="e.g. Project Apollo" class="input input-bordered w-full">
                            </div>
                        </div>

                        <div class="form-control w-full mb-6">
                            <label class="label"><span class="label-text font-semibold">Tags</span></label>
                            <input type="text" name="tagcsv" placeholder="electronics, office, spare" class="input input-bordered w-full">
                            <label class="label"><span class="label-text-alt text-gray-400">Separated by comma.</span></label>
                        </div>

                        <div class="form-control w-full">
                            <label class="label"><span class="label-text font-semibold">Custom Attributes</span></label>
                            <div class="bg-base-200 rounded-lg p-2">
                                <AttributeAdder />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- RIGHT COLUMN: Media & Placement (takes 5 columns on desktop) -->
            <div class="lg:col-span-5 flex flex-col gap-6">
                
                <div class="card bg-base-100 shadow-sm border border-base-200">
                    <div class="card-body">
                        <h3 class="font-semibold mb-4">Images</h3>
                        <MediaHub 
                            photoTypes={photoTypes} 
                            on:success={(ev) => notify("success", ev.detail)} 
                        />
                    </div>
                </div>

                <div class="card bg-base-100 shadow-sm border border-base-200">
                    <div class="card-body">
                        <h3 class="font-semibold mb-2">Location & Tracking</h3>
                        
                        {#if LARGE_CONTAINER_SELECTOR}
                            <div class="mb-4 rounded-box border border-base-300 bg-base-50" style="max-height: 20vh; overflow-y: scroll;">
                                <ContainerSelectorLarge containers={data.containers} />
                            </div>
                        {:else}
                            <div class="mb-4">
                                <ContainerSelector 
                                    mini={minimalInput}
                                    containers={data.containers}
                                    on:success={(ev) => notify("success", ev.detail)}
                                />
                            </div>
                        {/if}

                        <div class="pt-4 border-t border-base-200">
                            <QRurlScanner 
                                mini={minimalInput}
                                on:success={(ev) => notify("success", ev.detail)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Submit Button Floating Footer -->
        <div class="mt-8 pt-4 border-t flex justify-end pb-10 lg:pb-0">
            <button disabled={saving} type="submit" class="btn btn-primary btn-lg w-full md:w-auto shadow-md">
                {#if saving}
                    <span class="loading loading-spinner loading-md"></span> Saving Item...
                {:else}
                    <i class="bi bi-save mr-2"></i> Save Product
                {/if}
            </button>
        </div>
    {/if}
</form>

<Notifications bind:notifications />