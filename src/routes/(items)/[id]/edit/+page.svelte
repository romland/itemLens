<script lang="ts">
    import { enhance } from "$app/forms";
    import { beforeNavigate } from "$app/navigation";
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData, PageServerData } from "./$types";
    import type { SubmitFunction } from '@sveltejs/kit';
    import PasteHandler from "$lib/components/PasteHandler.svelte";
    import ItemHub from "$lib/components/ItemHub.svelte";
    import pageTitle from '$lib/stores';
    import { saveToQueue } from '$lib/client/offlineQueue';
	import { notify } from "$lib/client/notifications";

    export let data: PageServerData;
    export let form: ActionData;

    let saving = false;
    let isDirty = false;
    let hasSubmitted = false;
    let pastedDocCount = 0;

    beforeNavigate(({ cancel }) => {
        if (isDirty && !hasSubmitted) {
            if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
                cancel();
            }
        }
    });

    const onSubmit: SubmitFunction = async ({ cancel, formData }) => {
        // Stop SvelteKit from natively submitting the form
        cancel();
        if (saving) {
            return;
        }        
        saving = true;

        hasSubmitted = true;
        try {
            await saveToQueue(`/${data.item?.id}/edit`, formData);
            notify("success", "Changes queued! Returning...");
            window.dispatchEvent(new CustomEvent('outbox-trigger'));
            
            // Detach execution to ensure router cleanly navigates away
            setTimeout(() => {
                history.back();
            }, 10);
        } catch (err) {
            saving = false;
            hasSubmitted = false;
            notify("error", "Failed to queue changes.");
        }       
    }
    
    pageTitle.set("Edit " + data.item?.title);
</script>

<PasteHandler 
    formId="eltForm" 
    on:success={(ev) => { notify("success", ev.detail); isDirty = true; }}
    on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
    on:processingComplete={(ev) => { 
        notify(ev.detail.status, ev.detail.message, ev.detail.taskId);
        if (ev.detail.status === 'success') {
            isDirty = true;
            pastedDocCount++;
        }
    }}
/>

{#if form?.error}
    <div class="mb-6 max-w-2xl mx-auto">
        <Alert>{@html form?.message}</Alert>
    </div>
{/if}

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit} on:input={() => isDirty = true} on:change={() => isDirty = true}>
    <input type="hidden" name="id" value={data.item?.id}>
    <ItemHub 
        item={data.item}
        containers={data.containers} 
        saving={saving} 
        bind:isDirty
        pastedDocCount={pastedDocCount}
        on:success={(ev) => notify("success", ev.detail)} 
        on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
        on:processingComplete={(ev) => notify(ev.detail.status, ev.detail.message, ev.detail.taskId)}
    />
</form>
