<!-- src/lib/components/add/MediaHub.svelte -->
<script lang="ts">
    /* Passes the pre-existing values correctly for Edit mode into the MultiImageUpload. */
    import MultiImageUpload from "$lib/components/MultiImageUpload.svelte";
    import MultiImageFetcher from "$lib/components/MultiImageFetcher.svelte";
    import { createEventDispatcher } from 'svelte';
    
    const dispatch = createEventDispatcher();

    export let photoTypes = [];
    export let photoValues = [];
    
    // View state for tabs
    let activeTab = 'device'; // 'device' | 'web'
</script>

<div class="flex flex-col w-full">
    <!-- Tab Navigation -->
    <div role="tablist" class="flex bg-base-200/70 p-1 mb-4 w-full rounded-xl">
        <button 
            type="button" 
            role="tab" 
            class="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center flex-nowrap whitespace-nowrap {activeTab === 'device' ? 'bg-base-100 shadow text-base-content' : 'text-gray-500 hover:text-gray-700'}"
            on:click={() => activeTab = 'device'}
        >
            <i class="bi bi-camera mr-2 whitespace-nowrap"></i> <span class="truncate">From Device</span>
        </button>
        <button 
            type="button" 
            role="tab" 
            class="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center flex-nowrap whitespace-nowrap {activeTab === 'web' ? 'bg-base-100 shadow text-base-content' : 'text-gray-500 hover:text-gray-700'}"
            on:click={() => activeTab = 'web'}
        >
            <i class="bi bi-link-45deg mr-2 whitespace-nowrap"></i> <span class="truncate">From Web</span>
        </button>
    </div>

    <!-- Dropzone Area with tighter mobile padding -->
    <div class="bg-base-50/50 rounded-xl border-2 border-dashed border-base-300 p-2 sm:p-6 min-h-[220px] flex flex-col items-center justify-center transition-all">
        
        {#if activeTab === 'device'}
            {#if photoValues.length === 0}
            <div class="text-center mb-4 animate-fade-in">
                <div class="bg-base-200 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="bi bi-cloud-arrow-up text-2xl text-gray-500"></i>
                </div>
                <h3 class="font-semibold text-lg">Upload Images</h3>
                <p class="text-sm text-gray-400">Snap an image or browse files</p>
            </div>
            {/if}
            
            <div class="w-full max-w-sm">
                <MultiImageUpload 
                    {photoTypes} 
                    values={photoValues}
                    on:success 
                    on:analyzingStart
                    on:analyzingComplete
                />
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
                <MultiImageFetcher {photoTypes} on:success />
            </div>
        {/if}
    </div>
</div>