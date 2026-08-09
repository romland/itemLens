<script lang="ts">
    /* Replaces the previous disjointed edit logic, mapping gracefully to the new ItemHub wrapper. */
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData, PageServerData } from "./$types";
    import type { SubmitFunction } from '@sveltejs/kit';
    import Notifications from "$lib/components/Notifications.svelte";
    import PasteHandler from "$lib/components/PasteHandler.svelte";
    import ItemHub from "$lib/components/ItemHub.svelte";
    import pageTitle from '$lib/stores';

    export let data: PageServerData;
    export let form: ActionData;

    let saving = false;
    let notifications: any[] = [];

    const onSubmit: SubmitFunction = async (data) => {
    const onSubmit: SubmitFunction = async ({ cancel }) => {
        if (saving) {
            cancel();
            return;
        }        
        saving = true;
        return async (options) => {
            saving = false;
            if (options.result?.type === "failure") {
                const msg = String(options.result.data?.message || "Failed to save item.").replace(/<\/?[^>]+(>|$)/g, "");
                notify("error", msg);
            }
            options.update();
        }
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

    pageTitle.set("Edit " + data.item?.title);
</script>

<PasteHandler 
    formId="eltForm" 
    on:success={(ev) => notify("success", ev.detail)} 
    on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
    on:processingComplete={(ev) => notify(ev.detail.status, ev.detail.message, ev.detail.taskId)}
/>

{#if form?.error}
    <div class="mb-6 max-w-2xl mx-auto">
        <Alert>{@html form?.message}</Alert>
    </div>
{/if}

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit}>
    <input type="hidden" name="id" value={data.item?.id}>
    <ItemHub 
        item={data.item}
        containers={data.containers} 
        saving={saving} 
        on:success={(ev) => notify("success", ev.detail)} 
        on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
        on:processingComplete={(ev) => notify(ev.detail.status, ev.detail.message, ev.detail.taskId)}
    />
</form>

<Notifications bind:notifications />