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
    import pageTitle from '$lib/stores';

    let saving = false;
    let isDirty = false;
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

    const onSubmit: SubmitFunction = async (data) => {
        saving = true;
        return async (options) => {
            saving = false;
            if(options.result?.type === "redirect") {
                window.location.href = options.result.location;
            } else if (options.result?.type === "failure") {
                const msg = String(options.result.data?.message || "Failed to save item.").replace(/<\/?[^>]+(>|$)/g, "");
                notify("error", msg);
                options.update();
            } else {
                options.update();
            }
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

    pageTitle.set("Add new product");
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

<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit} on:input={() => isDirty = true} on:change={() => isDirty = true}>
    <ItemHub 
        containers={data.containers} 
        saving={saving} 
        on:success={(ev) => notify("success", ev.detail)} 
        on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
        on:processingComplete={(ev) => notify(ev.detail.status, ev.detail.message, ev.detail.taskId)}
    />
</form>

<Notifications bind:notifications />