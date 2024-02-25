<script lang="ts">
    import type { ActionData } from "./$types";
    import type { PageServerData } from "./$types";

    import { tick }  from 'svelte';
    import { enhance, type SubmitFunction } from '$app/forms';
    import { redirect } from '@sveltejs/kit';
    import { photoTypes } from "$lib/shared/constants.ts";

    import Alert from "$lib/components/alert.svelte";
    import Title from "$lib/components/Title.svelte";
    import QRreader from "$lib/components/QRreader.svelte";
    import MultiImageUpload from "$lib/components/MultiImageUpload.svelte";
    import MultiImageFetcher from "$lib/components/MultiImageFetcher.svelte";
    import ContainerSelector from "$lib/components/ContainerSelector.svelte";
    import ContainerSelectorLarge from "$lib/components/ContainerSelectorLarge.svelte";
    import QRurlScanner from "$lib/components/QRurlScanner.svelte";
    import Notifications from "$lib/components/Notifications.svelte";
    import AttributeAdder from "$lib/components/AttributeAdder.svelte";

    const LARGE_CONTAINER_SELECTOR = false;

    // minimalInput = false = more controls (think: larger screen, no camera)
    let minimalInput = true;

    let saving = false;
    let notifications = [];

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
    

    function notify(status, message)
    {
        notifications.push( { status, message } );
        // NOTE: Without this self-assignment (which I tend to forget), when pushed through, 
        //       the #if blocks throw an awkward error:
        //       if_block1.p is not a function.
        //       (back in the day ... nothing would happen without it)
        notifications = notifications;
        setTimeout(() => {
            notifications.shift();
            notifications = notifications;
        }, 3000)
    }

    if(typeof window !== 'undefined') {
        const toggleMinimal = () => {
            if(window.innerWidth > 600) {
                minimalInput = false;
            } else {
                minimalInput = true;
            }
        }
        toggleMinimal();
        document.addEventListener("resize", toggleMinimal);
    }

$:  console.log("Form changed:", form);


    import pageTitle from '$lib/stores';
    pageTitle.set("Add new product");
</script>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<div class="flex justify-items mb-3">
    Extended <input type="checkbox" class="toggle ml-2 mr-2" bind:checked={minimalInput} on:click={()=>minimalInput = !minimalInput} /> Brief mode
</div>

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
    <div class="mb-3">
        <input type="text" name="title" value="" placeholder="Product name" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <textarea name="description" rows="5" placeholder="Product description" class="textarea textarea-bordered w-full"></textarea>
        <div class="mt-1 text-gray-400 text-xs">
            Markdown can be used.
        </div>
    </div>

    <div class="flex">
        <MultiImageUpload
            photoTypes={photoTypes}
            on:success={(ev) => notify("success", ev.detail)}
        />

        <MultiImageFetcher
            photoTypes={photoTypes}
        />
    </div>


    {#if LARGE_CONTAINER_SELECTOR}
        <div class="mb-3" style="max-height: 20vh; overflow-y: scroll;">
            <LargeContainerSelector containers={data.containers} />
        </div>
    {:else}
        <div class="mb-3">
            <ContainerSelector 
                mini={minimalInput}
                containers={data.containers}
                on:success={(ev) => notify("success", ev.detail)}
            />
        </div>
    {/if}

    <div class="mb-3">
        <QRurlScanner 
            mini={minimalInput}
            on:success={(ev) => notify("success", ev.detail)}
        />
    </div>

    <div class:hidden={minimalInput} class="mb-3">
        <input type="text" name="amount" value="" placeholder="Number of items" class="input input-bordered w-full">
    </div>

    <div class:hidden={minimalInput} class="mb-3">
        <input type="text" name="reason" value="" placeholder="Reason for purchase (project)" class="input input-bordered w-full">
    </div>

    <div class:hidden={minimalInput} class="mb-3">
        <AttributeAdder />
    </div>

    <div class:hidden={minimalInput} class="mb-3">
        <input type="text" name="tagcsv" placeholder="Tags" class="input input-bordered w-full">
        <div class="mt-1 text-gray-400 text-xs">
            Seperated by comma.
        </div>
    </div>

    <div class="flex justify-end">
        <button disabled={saving} type="submit" class="btn btn-primary">
            {#if saving}
                <span class="loading loading-infinity loading-lg"></span>Uploading and saving
            {:else}
                Save
            {/if}
        </button>
    </div>
</form>

<Notifications
    bind:notifications
/>
