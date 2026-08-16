<script lang="ts">
    import ScopeSelector from '$lib/components/compare/ScopeSelector.svelte';
    import CompareResults from '$lib/components/compare/CompareResults.svelte';
    import { createEventDispatcher, onMount } from 'svelte';
    import { beforeNavigate } from '$app/navigation';

    export let containers: any[] = [];
    const dispatch = createEventDispatcher();

    let fileInputCamera: HTMLInputElement;
    let fileInputGallery: HTMLInputElement;
    let isScanning = false;
    let scanHint = '';
    let scopeType: 'all' | 'tag' | 'container' = 'all';
    let scopeValue = '';

    let compareResults: any = null;

    onMount(() => {
        if (typeof sessionStorage !== 'undefined') {
            const cached = sessionStorage.getItem('itemlens_compare_state');
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    compareResults = parsed.compareResults;
                    if (parsed.scopeType) scopeType = parsed.scopeType;
                    if (parsed.scopeValue) scopeValue = parsed.scopeValue;
                    if (parsed.scanHint) scanHint = parsed.scanHint;
                } catch (e) {}
            }
        }
    });

    beforeNavigate(() => {
        if (typeof sessionStorage !== 'undefined') {
            if (compareResults) {
                sessionStorage.setItem('itemlens_compare_state', JSON.stringify({ compareResults, scopeType, scopeValue, scanHint }));
            } else {
                sessionStorage.removeItem('itemlens_compare_state');
            }
        }
    });

    async function handleFileSelect(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        isScanning = true;
        dispatch('processingStart', { message: 'Comparing with your Inventory...', taskId: 'compare' });

        const fd = new FormData();
        fd.append('file', file);
        fd.append('scopeType', scopeType);
        fd.append('scopeValue', scopeValue);
        if (scanHint.trim()) fd.append('hint', scanHint.trim());

        try {
            const res = await fetch('/api/compare-collection', { method: 'POST', body: fd });
            const data = await res.json();
            if (res.ok && data.success) {
                compareResults = data;
                dispatch('success', `Found ${data.totalDetected} items!`);
            } else {
                alert(data.error || 'Comparison failed.');
            }
        } catch (err) {
            alert('Network error while processing comparison.');
        } finally {
            isScanning = false;
            dispatch('processingComplete', { taskId: 'compare', status: 'success' });
        }
    }

    export function reset() {
        compareResults = null;
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('itemlens_compare_state');
    }
</script>

<div class="flex flex-col w-full max-w-lg mx-auto">
    {#if !compareResults}
        <div class="text-center mb-6 animate-fade-in">
            <div class="bg-primary/10 text-primary w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                <i class="bi bi-search-heart text-3xl"></i>
            </div>
            <h2 class="text-xl font-bold tracking-tight">Compare with Collection</h2>
            <p class="text-gray-500 text-xs mt-1">Snap a photo of shelves, crates, or groceries to see what you own and what you're missing.</p>
        </div>

        <!-- Step 1: Scope Target -->
        <div class="mb-6">
            <ScopeSelector {containers} on:change={(e) => { scopeType = e.detail.scopeType; scopeValue = e.detail.scopeValue; }} />
        </div>

        <!-- Step 2: Context Hint -->
        <div class="mb-6">
            <input type="text" bind:value={scanHint} placeholder="Optional context (e.g. 'Sci-Fi paperbacks', 'Spices')..." class="input input-sm input-bordered w-full rounded-xl bg-base-100 text-xs shadow-inner" />
        </div>

        <!-- Step 3: Trigger Buttons -->
        {#if isScanning}
            <div class="btn btn-primary btn-lg w-full rounded-2xl opacity-80 cursor-not-allowed flex items-center justify-center gap-3">
                <span class="loading loading-spinner"></span>
                <span class="font-bold text-sm">Inspecting items...</span>
            </div>
        {:else}
            <div class="flex gap-3 w-full">
                <button type="button" class="btn btn-primary flex-1 shadow-lg rounded-2xl active:scale-95 transition-transform" on:click={() => fileInputCamera.click()}>
                    <i class="bi bi-camera text-xl"></i> Snap Photo
                </button>
                <button type="button" class="btn btn-secondary flex-1 shadow-lg rounded-2xl active:scale-95 transition-transform" on:click={() => fileInputGallery.click()}>
                    <i class="bi bi-images text-xl"></i> Gallery
                </button>
            </div>
        {/if}

        <input type="file" bind:this={fileInputCamera} accept="image/*" capture="environment" class="hidden" on:change={handleFileSelect} />
        <input type="file" bind:this={fileInputGallery} accept="image/*" class="hidden" on:change={handleFileSelect} />
    {:else}
        <div class="flex items-center justify-between mb-4 border-b border-base-200 pb-3">
            <h2 class="text-xl font-bold tracking-tight">Scan Results</h2>
            <button type="button" class="btn btn-sm btn-ghost rounded-xl gap-1 text-gray-500" on:click={reset}><i class="bi bi-arrow-counterclockwise"></i> Scan Again</button>
        </div>
        <CompareResults results={compareResults} on:notify={(e) => dispatch(e.detail.status, e.detail.message)} />
    {/if}
</div>