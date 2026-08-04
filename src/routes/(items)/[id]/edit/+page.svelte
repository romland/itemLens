<script lang="ts">
    import type { ActionData, PageServerData } from "./$types";
    import type { SubmitFunction } from "@sveltejs/kit";
    import { enhance } from "$app/forms";
    import { photoTypes } from "$lib/shared/constants.ts";
    import { marked } from "marked";

    import Alert from "$lib/components/alert.svelte";
    import QRreader from "$lib/components/QRreader.svelte";
    import MultiImageUpload from "$lib/components/MultiImageUpload.svelte";
    import MultiImageFetcher from "$lib/components/MultiImageFetcher.svelte";
    import ContainerSelector from "$lib/components/ContainerSelector.svelte";
    import ContainerSelectorLarge from "$lib/components/ContainerSelectorLarge.svelte";
    import QRurlScanner from "$lib/components/QRurlScanner.svelte";
    import Notifications from "$lib/components/Notifications.svelte";
    import AttributeAdder from "$lib/components/AttributeAdder.svelte";
    import RefreshDeleteList from "$lib/components/RefreshDeleteList.svelte";
    import PasteHandler from "$lib/components/PasteHandler.svelte";

    export let data: PageServerData;
    export let form: ActionData;

    let notifications = [];
    let saving = false;
    let markdownHtml = "";

// Bind to local state so we can mutate it directly via the AI
    let currentTitle = data.item?.title || "";
    let currentDescription = data.item?.description || "";

    // AI Drawer State
    let showAiDrawer = false;
    let userHint = "";
    let isRefining = false;

    async function runAiRefine() {
        if (!userHint.trim() || !data.item?.id) return;
        
        isRefining = true;
        try {
            const res = await fetch('/api/ai-refine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    itemId: data.item.id,
                    hint: userHint 
                })
            });
            
            if (res.ok) {
                const result = await res.json();
                if (result.title) currentTitle = result.title;
                if (result.description) {
                    currentDescription = result.description;
                    updateMarkdownPreview(); // Keep your preview tab in sync
                }
                showAiDrawer = false;
                userHint = ""; // Reset for next time
                notify("success", "Item details enhanced by AI!");
            } else {
                notify("error", "Failed to refine with AI.");
            }
        } catch (e) {
            console.error(e);
            notify("error", "Network error communicating with AI.");
        } finally {
            isRefining = false;
        }
    }

    const onSubmit: SubmitFunction = async (data) => {
        saving = true;

        return async (options) => {
            saving = false;
            if(options.result?.type === "redirect") {
                window.location.href = options.result.location;
            }
        }
    }

    function updateMarkdownPreview()
    {
        markdownHtml = marked.parse(description.value, {gfm:true,breaks:true});
    }

    function notify(status, ev)
    {
        notifications.push({status, message:ev.detail});
    }

    import pageTitle from '$lib/stores';
    pageTitle.set("Edit " + data.item?.title);
</script>

<PasteHandler formId="eltForm" on:success={(ev) => notify("success", ev.detail)} />

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
    <input type="hidden" name="id" value="{data.item?.id}">

    <div class="mb-3 relative w-full">
        <input type="text" name="title" bind:value={currentTitle} placeholder="Product name" class="input input-bordered w-full pr-12">
        <button type="button" class="absolute right-3 top-3 text-primary/70 hover:text-primary transition-colors" title="Refine with AI" on:click={() => showAiDrawer = true}>
            <i class="bi bi-stars text-xl"></i>
        </button>
    </div>

    <div class="mb-3">
        <div role="tablist" class="tabs tabs-lifted">
            <input type="radio" name="markdownEditorTab" role="tab" class="tab" aria-label="Edit" checked />
            <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6 relative">
                <textarea id="description" name="description" bind:value={currentDescription} rows="5" placeholder="Product description" class="textarea textarea-bordered w-full"></textarea>
                <div class="mt-1 text-gray-400 text-xs">
                    Markdown can be used.
                </div>
            </div>
            
            <input type="radio" name="markdownEditorTab" role="tab" class="tab" aria-label="Preview" on:click={updateMarkdownPreview}/>
            <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
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

    <RefreshDeleteList
        values={data.item?.documents || []}
        inputName="documents"
        columns={{
            "3":{name:"Title",     fieldName:"title", isImage: false},
            "4":{name:"Filename", fieldName:"path", isLink: true}
        }}
    />

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

<!-- The Bottom Drawer -->
<dialog class="modal modal-bottom sm:modal-middle" class:modal-open={showAiDrawer}>
    <div class="modal-box p-6 bg-base-100/95 backdrop-blur-xl rounded-t-3xl">
        <h3 class="font-bold text-xl mb-2 flex items-center gap-2">
            <i class="bi bi-stars text-primary"></i> Refine AI Guess
        </h3>
        <p class="text-sm text-gray-500 mb-6">Give the AI a nudge with a brand or model name to get a better match.</p>
        
        <input type="text" bind:value={userHint} on:keydown={(e) => e.key === 'Enter' && runAiRefine()} placeholder="e.g. It's actually a MITTZON desk" class="input input-bordered w-full rounded-xl mb-4" />
        
        <div class="modal-action mt-0 flex gap-2">
            <button type="button" class="btn btn-ghost rounded-xl flex-1" on:click={() => showAiDrawer = false}>Cancel</button>
            <button type="button" class="btn btn-primary rounded-xl flex-1 shadow-md" on:click={runAiRefine} disabled={isRefining}>
                {#if isRefining}
                    <span class="loading loading-spinner"></span>
                {:else}
                    Enhance
                {/if}
            </button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button type="button" on:click={() => showAiDrawer = false}>close</button>
    </form>
</dialog>