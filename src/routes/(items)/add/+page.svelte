<!-- src/routes/(items)/add/+page.svelte -->
<script lang="ts">
    /* Integrates the ItemHub similarly into Add mode, achieving 100% parity across forms and screens. */
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData, PageServerData } from "./$types";
    import type { SubmitFunction } from '@sveltejs/kit';
    import { beforeNavigate } from '$app/navigation';
    import PasteHandler from "$lib/components/PasteHandler.svelte";
    import ItemHub from "$lib/components/ItemHub.svelte";
    import BulkTriage from "$lib/components/add/BulkTriage.svelte";
    import CompareHub from "$lib/components/compare/CompareHub.svelte";
    import pageTitle from '$lib/stores';
    import { saveToQueue } from '$lib/client/offlineQueue';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
	import { notify } from "$lib/client/notifications";

    let saving = false;
    let isDirty = false;
    let hasSubmitted = false;
    let pastedDocCount = 0;
    
    let pasteHandler: PasteHandler;

    // Generate an idempotency key (Browser-safe fallback for SSR)
    let clientId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    
    let bulkTriageComponent: BulkTriage;
    let compareHubComponent: CompareHub;
    let itemHubComponent: ItemHub;

    // =========================================================================================
    // TODO: USER PREFERENCES WIRING
    // In the future, to make this togglable in the UI:
    // 1. Add `continuousScanning Boolean @default(false)` to the User model in schema.prisma.
    // 2. Add a toggle in settings.
    // 3. Read it here via SvelteKit data: `const CONTINUOUS_SCANNING = data.user.continuousScanning;`
    // =========================================================================================
    const CONTINUOUS_SCANNING = false;

    beforeNavigate(({ cancel }) => {
        if (isDirty && !hasSubmitted) {
            if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
                cancel();
            }
        }
    });
    
    export let form: ActionData;
    export let data: PageServerData;
    
    let mode: 'single' | 'collection' | 'compare' = (data as any).activeAddMode;
    
    function setMode(newMode: 'single' | 'collection' | 'compare') {
        mode = newMode;
        document.cookie = `itemlens_add_mode=${mode}; path=/; max-age=${60 * 60 * 24 * 365}`;
    }

    onMount(() => {
        // FIX: Bypass SvelteKit layout caching staleness by reading the real browser cookie.
        const match = document.cookie.match(/(?:^|;\s*)itemlens_add_mode=([^;]*)/);
        if (match && match[1] && ['single', 'collection', 'compare'].includes(match[1])) {
            console.log('[Add Hub] Cookie sync on mount:', match[1]);
            if (mode !== match[1]) mode = match[1] as any;
        }

        const handleShortcutMode = (e: CustomEvent) => {
            const newMode = e.detail;
            console.log('[Add Hub] Received shortcut event:', newMode);
            if (mode !== newMode) {
                if (isDirty && !confirm('You have unsaved changes. Switch modes and lose them?')) return;
                isDirty = false;
                setMode(newMode);
            }
        };
        window.addEventListener('shortcut:addMode', handleShortcutMode as EventListener);
        return () => window.removeEventListener('shortcut:addMode', handleShortcutMode as EventListener);
    });

    const onSubmit: SubmitFunction = async ({ cancel, formData }) => {
        // Stop SvelteKit from natively submitting the form! 
        // If missing, SvelteKit AND our Outbox will both upload it, causing duplicates.
        cancel();
        if (saving) {
            return;
        }
        console.log("🛠️ [DEBUG AMBIENT] Form submitting! Extracted containers from DOM:", formData.getAll('containers'));

        saving = true;
        hasSubmitted = true;
        formData.append('clientId', clientId);
        try {
            await saveToQueue('/add', formData);
            notify("success", "Item saved in background!");
            pasteHandler?.clearQueue();
            window.dispatchEvent(new CustomEvent('outbox-trigger'));
            
            // Detach router execution from the current microtask to bypass deadlock
            setTimeout(async () => {
                if (CONTINUOUS_SCANNING) {
                    clientId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
                    if (itemHubComponent) itemHubComponent.reset();
                    isDirty = false;
                    hasSubmitted = false;
                    saving = false;
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    await goto('/', { invalidateAll: true });
                }
            }, 10);
        } catch (err) {
            console.error("Queue Error:", err);
            notify("error", "Failed to save item. Please try again.");
            hasSubmitted = false;
            saving = false;
        }

    }
    
    
    pageTitle.set("Add new product");
    $:  pageTitle.set(mode === 'single' ? "Add new product" : mode === 'collection' ? "Add Collection" : "Compare Collection");
    
</script>

<PasteHandler 
bind:this={pasteHandler}
formId="eltForm" 
forcePhotoType={mode === 'collection' || mode === 'compare' ? 'product' : null}
on:save={(ev) => {
    if (mode === 'collection' && ev.detail.file) {
        bulkTriageComponent?.processPastedFile(ev.detail.file);
    }
    else if (mode === 'compare' && ev.detail.file) {
        compareHubComponent?.processPastedFile(ev.detail.file);
    }
}}
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

{#if form && form.error}
<div class="mb-6 max-w-2xl mx-auto">
    <Alert>{@html form.message}</Alert>
</div>
{/if}

{#if data.isBootstrapping}
    <div class="flex flex-col items-center justify-center min-h-[50vh] text-center max-w-md mx-auto px-4">
        <div class="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6 shadow-sm">
            <span class="loading loading-ring loading-lg"></span>
        </div>
        <h2 class="text-2xl font-bold mb-3 tracking-tight">Initializing Vault...</h2>
        <p class="text-gray-500 mb-8">The AI is currently analyzing your vault's archetype and building a custom taxonomy schema. This usually takes 10-20 seconds.</p>
        <button type="button" class="btn btn-outline" on:click={() => window.location.reload()}>
            <i class="bi bi-arrow-clockwise"></i> Refresh Status
        </button>
    </div>
{:else}

<div class="bg-base-200 p-1 rounded-2xl flex w-full max-w-md mx-auto mb-6 mt-2 relative z-10 border border-base-300">
    <button type="button" class="flex-1 btn btn-sm border-none {mode === 'single' ? 'bg-base-100 shadow-sm hover:bg-base-100 text-base-content' : 'btn-ghost text-gray-500 hover:text-base-content hover:bg-base-300'}" on:click={() => {
        if (mode !== 'single' && isDirty && !confirm('You have unsaved scanned items. Switch modes and lose them?')) return;
        isDirty = false;
        setMode('single');
    }}>Single Item</button>
    <button type="button" class="flex-1 btn btn-sm border-none {mode === 'collection' ? 'bg-base-100 shadow-sm hover:bg-base-100 text-base-content' : 'btn-ghost text-gray-500 hover:text-base-content hover:bg-base-300'}" on:click={() => {
        if (mode !== 'collection' && isDirty && !confirm('You have unsaved changes. Switch modes and lose them?')) return;
        isDirty = false;
        setMode('collection');
    }}>Multi-Scan</button>
    
    <button type="button" class="flex-1 btn btn-sm border-none {mode === 'compare' ? 'bg-base-100 shadow-sm hover:bg-base-100 text-base-content font-bold text-primary' : 'btn-ghost text-gray-500 hover:text-base-content hover:bg-base-300'}" on:click={() => {
        isDirty = false;
        setMode('compare');
    }}>Comparison</button>
</div>

{#if mode === 'single'}
<form id="eltForm" method="post" enctype="multipart/form-data" use:enhance={onSubmit} on:input={() => isDirty = true} on:change={() => isDirty = true}>
    <ItemHub 
    bind:this={itemHubComponent}
    containers={data.containers} 
    saving={saving}
    bind:isDirty
    pastedDocCount={pastedDocCount}
    on:success={(ev) => notify("success", ev.detail)} 
    on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
    on:processingComplete={(ev) => notify(ev.detail.status, ev.detail.message, ev.detail.taskId)}
    />
</form>
{:else if mode === 'collection'}
<BulkTriage 
bind:this={bulkTriageComponent}
containers={data.containers} 
categories={data.categories}
tags={data.tags}
bind:isDirty
on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
on:processingComplete={(ev) => notify(ev.detail.status, ev.detail.message, ev.detail.taskId)}
/>
{:else}
<CompareHub 
bind:this={compareHubComponent}
containers={data.containers}
categories={data.categories}
tags={data.tags}
on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
on:processingComplete={(ev) => notify(ev.detail.status, ev.detail.message, ev.detail.taskId)}
on:success={(ev) => notify("success", ev.detail)}
/>
{/if}
{/if}
