<script lang="ts">
    import type { ActionData, PageServerData } from "./$types";
    import { enhance } from "$app/forms";
    import { photoTypes } from "$lib/shared/constants.ts";
    import { marked } from "marked";

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
    import RefreshDeleteList from "$lib/components/RefreshDeleteList.svelte";
  
    export let data: PageServerData;
    export let form: ActionData;

    let notifications = [];
    let saving = false;
    let markdownHtml = "";

    // TODO: Is this messing with form-validation messages?
    const onSubmit: SubmitFunction = async (data) => {
        throw "TODO save";
        saving = true;

        return async (options) => {
            // After the form submits...
            saving = false;
            if(options.result?.type === "redirect") {
                window.location.href = options.result.location;
            }
        }
    }


    function updateMarkdownPreview()
    {
        // TODO: Security. Sanitize?
        // markdownHtml = marked.parse(data.item?.description!, {gfm:true,breaks:true});
        markdownHtml = marked.parse(description.value, {gfm:true,breaks:true});
    }


</script>

<svelte:head>
    <Title>Edit Item</Title>
</svelte:head>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}
<!--
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
-->

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
    <input type="hidden" name="id" value="{data.item?.id}">

    <div class="mb-3">
        <input type="text" name="title" value="{data.item?.title}" placeholder="Product name" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <div role="tablist" class="tabs tabs-lifted">
            <input type="radio" name="my_tabs_2" role="tab" class="tab" aria-label="Edit" checked />
            <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
                <!-- for live changes: on:input={updateMarkdownPreview} -->
                <textarea id="description" name="description" rows="5" placeholder="Product description" class="textarea textarea-bordered w-full">{data.item?.description}</textarea>
                <div class="mt-1 text-gray-400 text-xs">
                    Markdown can be used.
                </div>
            </div>
            
            <input type="radio" name="my_tabs_2" role="tab" class="tab" aria-label="Preview" on:click={updateMarkdownPreview}/>
            <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
                <!-- preview -->
                <div class="content prose max-w-none mb-3">
                    {@html markdownHtml}
                </div>
            </div>
        </div>

    </div>

    <div class="mb-3">
        <MultiImageUpload
            photoTypes={photoTypes}
            values={data.item?.photos}
            on:success={(ev) => notify("success", ev.detail)}
        />

        <MultiImageFetcher
            photoTypes={photoTypes}
        />
    </div>

    <div class="mb-3">
        <ContainerSelector 
            containers={data.containers}
            values={data.item?.locations}
            on:success={(ev) => notify("success", ev.detail)}
        />
    </div>

    <div class="mb-3">
        <QRurlScanner 
            on:success={(ev) => notify("success", ev.detail)}
        />
    </div>

    {#if data.item?.documents.length > 0}
        <RefreshDeleteList
            values={data.item?.documents}
            inputName="documents"
            columns={{
                "3":{name:"Title",    fieldName:"title", isImage: false},
                "4":{name:"Filename", fieldName:"path", isLink: true}
            }}
        />
    {/if}

    <div class="mb-3">
        <input type="text" name="amount" value="{data.item?.amount}" placeholder="Number of items" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <input type="text" name="reason" value="{data.item?.reason}" placeholder="Reason for purchase (project)" class="input input-bordered w-full">
    </div>

    <div class="mb-3">
        <AttributeAdder
            values={data.item?.attributes}
        />
    </div>

    <div class="mb-3">
        <input type="text" name="tagcsv" placeholder="Tags" value="{data.item?.tagcsv}" class="input input-bordered w-full">
        <div class="mt-1 text-gray-400 text-xs">
            Seperated by comma.
        </div>
    </div>

    <div class="flex justify-end">
        <button disabled={saving} type="submit" class="btn btn-primary">
            {#if saving}
                <span class="loading loading-infinity loading-lg"></span>Uploading and updating
            {:else}
                Update
            {/if}
        </button>
    </div>
</form>

<Notifications
    bind:notifications
/>
