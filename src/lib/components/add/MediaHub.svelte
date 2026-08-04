<script lang="ts">
    import MultiImageUpload from "$lib/components/MultiImageUpload.svelte";
    import MultiImageFetcher from "$lib/components/MultiImageFetcher.svelte";
    import { createEventDispatcher } from 'svelte';
    
    const dispatch = createEventDispatcher();

    export let photoTypes = [];
    
    // View state for tabs
    let activeTab = 'device'; // 'device' | 'web'
</script>

<div class="flex flex-col w-full">
    <!-- Tab Navigation -->
    <div role="tablist" class="tabs tabs-boxed bg-base-200/50 p-1 mb-4 w-full grid grid-cols-2 rounded-xl">
        <button 
            type="button" 
            role="tab" 
            class="tab h-10 transition-all {activeTab === 'device' ? 'tab-active bg-base-100 shadow-sm font-semibold' : 'text-gray-500'}" 
            on:click={() => activeTab = 'device'}
        >
            <i class="bi bi-camera mr-2"></i> From Device
        </button>
        <button 
            type="button" 
            role="tab" 
            class="tab h-10 transition-all {activeTab === 'web' ? 'tab-active bg-base-100 shadow-sm font-semibold' : 'text-gray-500'}" 
            on:click={() => activeTab = 'web'}
        >
            <i class="bi bi-link-45deg mr-2"></i> From Web
        </button>
    </div>

    <!-- Dropzone Area -->
    <div class="bg-base-50/50 rounded-xl border-2 border-dashed border-base-300 p-6 min-h-[220px] flex flex-col items-center justify-center transition-all">
        
        {#if activeTab === 'device'}
            <div class="text-center mb-4 animate-fade-in">
                <div class="bg-base-200 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="bi bi-cloud-arrow-up text-2xl text-gray-500"></i>
                </div>
                <h3 class="font-semibold text-lg">Upload Images</h3>
                <p class="text-sm text-gray-400">Snap a photo or browse files</p>
            </div>
            
            <div class="w-full max-w-sm">
                <!-- Forwards the success event up to +page.svelte -->
                <MultiImageUpload {photoTypes} on:success />
            </div>

        {:else}
            <div class="text-center mb-4 animate-fade-in">
                <div class="bg-base-200 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="bi bi-globe text-2xl text-gray-500"></i>
                </div>
                <h3 class="font-semibold text-lg">Fetch from URL</h3>
                <p class="text-sm text-gray-400">Paste a direct link to an image</p>
            </div>
            
            <div class="w-full max-w-sm">
                <!-- Forwards the success event up to +page.svelte -->
                <MultiImageFetcher {photoTypes} on:success />
            </div>
        {/if}
    </div>
</div>