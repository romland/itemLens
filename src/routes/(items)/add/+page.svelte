<!-- src/routes/(items)/add/+page.svelte -->
<script lang="ts">
    /* Integrates the ItemHub similarly into Add mode, achieving 100% parity across forms and screens. */
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData, PageServerData } from "./$types";
    import type { SubmitFunction } from '@sveltejs/kit';
    import { beforeNavigate } from '$app/navigation';
    import Notifications from "$lib/components/Notifications.svelte";
    import PasteHandler from "$lib/components/PasteHandler.svelte";
    import ItemHub from "$lib/components/ItemHub.svelte";
    import BulkTriage from "$lib/components/add/BulkTriage.svelte";
    import pageTitle from '$lib/stores';
    import { saveToQueue } from '$lib/client/offlineQueue';
    import { goto } from '$app/navigation';

    let mode: 'single' | 'collection' = 'single';
    let saving = false;
    let isDirty = false;
    let pastedDocCount = 0;
    let notifications: any[] = [];

    beforeNavigate(({ cancel }) => {
        if (isDirty && !saving) {
            if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
                cancel();
            }
        }
    });

    export let form: ActionData;
    export let data: PageServerData;

    const onSubmit: SubmitFunction = async ({ cancel, formData }) => {
        // Stop SvelteKit from natively submitting the form! 
        // If missing, SvelteKit AND our Outbox will both upload it, causing duplicates.
        cancel();
        if (saving) {
            return;
        }
        saving = true;
        await saveToQueue('/add', formData);
        saving = false;
        isDirty = false;
        notify("success", "Item queued for upload! Ready for next.");
        window.dispatchEvent(new CustomEvent('outbox-trigger'));
        
        // // Fast workflow: Reset form to allow immediate scanning of next item
        // const eltForm = document.getElementById('eltForm') as HTMLFormElement;
        // if (eltForm) eltForm.reset();
        // await goto('/add', { invalidateAll: true });

        // Fast workflow: Return to home so user can seamlessly add another
        await goto('/', { invalidateAll: true });
    }
    
    function notify(status: string, message: string, id: string | null = null) {
        if (id) {
            const existingIndex = notifications.findIndex(n => n.id === id);
            if (existingIndex !== -1) {
                notifications[existingIndex] = { ...notifications[existingIndex], status, message };
                notifications = [...notifications];
                if (status !== 'loading') setTimeout(() => removeNotification(id), 3000);
                return id;
            }
        }
        const newId = id || Math.random().toString(36);
        notifications = [...notifications, { id: newId, status, message }];
        if (status !== 'loading') setTimeout(() => removeNotification(newId), 3000);
        return newId;
    }

    function removeNotification(id: string) {
        notifications = notifications.filter(n => n.id !== id);
    }

    pageTitle.set("Add new product");
$:  pageTitle.set(mode === 'single' ? "Add new product" : "Add Collection");

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

<div class="bg-base-200 p-1 rounded-xl flex w-full max-w-xs mx-auto mb-6 mt-2 relative z-10">
    <button type="button" class="flex-1 btn btn-sm border-none {mode === 'single' ? 'bg-base-100 shadow-sm hover:bg-base-100 text-base-content' : 'btn-ghost text-gray-500 hover:text-base-content hover:bg-base-300'}" on:click={() => {
        if (mode !== 'single' && isDirty && !confirm('You have unsaved Collection Items. Switch modes and lose them?')) return;
        isDirty = false;
        mode = 'single';
    }}>Single Item</button>
    <button type="button" class="flex-1 btn btn-sm border-none {mode === 'collection' ? 'bg-base-100 shadow-sm hover:bg-base-100 text-base-content' : 'btn-ghost text-gray-500 hover:text-base-content hover:bg-base-300'}" on:click={() => {
        if (mode !== 'collection' && isDirty && !confirm('You have unsaved changes. Switch modes and lose them?')) return;
        isDirty = false;
        mode = 'collection';
    }}>Collection</button>

</div>

{#if mode === 'single'}
    <form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit} on:input={() => isDirty = true} on:change={() => isDirty = true}>
        <ItemHub 
            containers={data.containers} 
            saving={saving}
            bind:isDirty
            pastedDocCount={pastedDocCount}
            on:success={(ev) => notify("success", ev.detail)} 
            on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
            on:processingComplete={(ev) => notify(ev.detail.status, ev.detail.message, ev.detail.taskId)}
        />
    </form>
{:else}
    <BulkTriage 
        containers={data.containers} 
        bind:isDirty
        on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
        on:processingComplete={(ev) => notify(ev.detail.status, ev.detail.message, ev.detail.taskId)}
    />
{/if}

<Notifications bind:notifications />