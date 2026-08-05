<script lang="ts">
    import MediaHub from "$lib/components/add/MediaHub.svelte";
    import ContainerSelector from "$lib/components/ContainerSelector.svelte";
    import QRurlScanner from "$lib/components/QRurlScanner.svelte";
    import AttributeAdder from "$lib/components/AttributeAdder.svelte";
    import { photoTypes } from "$lib/shared/constants";
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();

    export let containers = [];
    export let saving = false;

    // View state machine: 'hub', 'photos', 'location', 'links', 'details'
    let activeView = 'hub';

    // State for the Hub Badges
    let photoCount = 0;
    let selectedLocations = [];
    let linkCount = 0;
</script>

<div class="relative w-full overflow-hidden bg-base-100 min-h-[75vh] rounded-xl shadow-lg border border-base-200">
    
    <!-- ================= THE HUB VIEW ================= -->
    <div class="absolute inset-0 transition-transform duration-300 ease-in-out p-4 sm:p-6 overflow-y-auto {activeView === 'hub' ? 'translate-x-0' : '-translate-x-full'}">
        
        <div class="text-center mb-8">
            <h2 class="text-2xl font-bold">New Item</h2>
            <p class="text-gray-500 text-sm">Select a section to add details</p>
        </div>

        <div class="flex flex-col gap-3">
            
            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-between items-center rounded-xl border-base-300 hover:border-primary hover:bg-base-50" on:click={() => activeView = 'photos'}>
                <div class="flex items-center gap-4">
                    <div class="bg-blue-100 text-blue-600 w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0">
                        <i class="bi bi-camera"></i>
                    </div>
                    <div class="text-left">
                        <div class="font-bold text-base">Photos</div>
                        <div class="text-xs text-gray-500 font-normal">Upload or fetch</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    {#if photoCount > 0}
                        <span class="badge badge-primary">{photoCount}</span>
                    {/if}
                    <i class="bi bi-chevron-right text-gray-400"></i>
                </div>
            </button>

            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-between items-center rounded-xl border-base-300 hover:border-primary hover:bg-base-50" on:click={() => activeView = 'location'}>
                <div class="flex items-center gap-4">
                    <div class="bg-purple-100 text-purple-600 w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0">
                        <i class="bi bi-box-seam"></i>
                    </div>
                    <div class="text-left">
                        <div class="font-bold text-base">Location</div>
                        <div class="text-xs text-gray-500 font-normal">Scan QR or select</div>
                    </div>
                </div>
                <div class="flex items-center gap-1 flex-wrap justify-end">
                    {#if selectedLocations.length > 0}
                        {#each selectedLocations as loc}
                            <span class="badge badge-primary badge-sm font-mono">{loc}</span>
                        {/each}
                    {/if}
                    <i class="bi bi-chevron-right text-gray-400 ml-1"></i>
                </div>
            </button>

            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-between items-center rounded-xl border-base-300 hover:border-primary hover:bg-base-50" on:click={() => activeView = 'links'}>
                <div class="flex items-center gap-4">
                    <div class="bg-emerald-100 text-emerald-600 w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0">
                        <i class="bi bi-link-45deg"></i>
                    </div>
                    <div class="text-left">
                        <div class="font-bold text-base">Documents</div>
                        <div class="text-xs text-gray-500 font-normal">Manual or scan QR</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    {#if linkCount > 0}
                        <span class="badge badge-primary">{linkCount}</span>
                    {/if}
                    <i class="bi bi-chevron-right text-gray-400"></i>
                </div>
            </button>
            
            <button type="button" class="btn btn-outline h-auto py-4 px-4 w-full flex justify-between items-center rounded-xl border-base-300 hover:border-primary hover:bg-base-50" on:click={() => activeView = 'details'}>
                <div class="flex items-center gap-4">
                    <div class="bg-orange-100 text-orange-600 w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0">
                        <i class="bi bi-pencil-square"></i>
                    </div>
                    <div class="text-left">
                        <div class="font-bold text-base">Item Details</div>
                        <div class="text-xs text-gray-500 font-normal">Title, qty, tags...</div>
                    </div>
                </div>
                <i class="bi bi-chevron-right text-gray-400"></i>
            </button>

        </div>

        <div class="mt-8 pb-8">
            <button disabled={saving} type="submit" class="btn btn-primary btn-lg w-full rounded-xl shadow-md">
                {#if saving}
                    <span class="loading loading-spinner"></span> Processing...
                {:else}
                    <i class="bi bi-save mr-2"></i> Save to Inventory
                {/if}
            </button>
        </div>
    </div>

    <!-- ================= SUB-VIEWS ================= -->

    <!-- PHOTOS VIEW -->
    <div class="absolute inset-0 transition-transform duration-300 ease-in-out bg-base-100 flex flex-col {activeView === 'photos' ? 'translate-x-0' : 'translate-x-full'}">
        <div class="flex items-center p-4 sm:p-6 pb-2">
            <button type="button" class="btn btn-circle btn-ghost bg-base-200" on:click={() => activeView = 'hub'}><i class="bi bi-arrow-left text-xl"></i></button>
            <h2 class="text-xl font-bold ml-4">Photos</h2>
        </div>
        <div class="flex-1 overflow-y-auto px-2 sm:px-6 pb-6">
            <MediaHub 
                photoTypes={photoTypes} 
                on:success={(ev) => { photoCount++; dispatch('success', ev.detail); }} 
            />
        </div>
        <div class="p-4 sm:p-6 bg-base-100 border-t border-base-200">
            <button type="button" class="btn btn-neutral btn-lg w-full rounded-xl shadow-sm" on:click={() => activeView = 'hub'}><i class="bi bi-check2-circle mr-2"></i> Done</button>
        </div>
    </div>

    <!-- LOCATION VIEW -->
    <div class="absolute inset-0 transition-transform duration-300 ease-in-out bg-base-100 flex flex-col {activeView === 'location' ? 'translate-x-0' : 'translate-x-full'}">
        <div class="flex items-center p-4 sm:p-6 pb-2">
            <button type="button" class="btn btn-circle btn-ghost bg-base-200" on:click={() => activeView = 'hub'}><i class="bi bi-arrow-left text-xl"></i></button>
            <h2 class="text-xl font-bold ml-4">Storage Location</h2>
        </div>
        <div class="flex-1 overflow-y-auto px-2 sm:px-6 pb-6">
            <ContainerSelector 
                containers={containers} 
                on:success={(ev) => dispatch('success', ev.detail)}
                on:change={(ev) => selectedLocations = ev.detail.containers}
            />
        </div>
        <div class="p-4 sm:p-6 bg-base-100 border-t border-base-200">
            <button type="button" class="btn btn-neutral btn-lg w-full rounded-xl shadow-sm" on:click={() => activeView = 'hub'}><i class="bi bi-check2-circle mr-2"></i> Done</button>
        </div>
    </div>

    <!-- LINKS VIEW -->
    <div class="absolute inset-0 transition-transform duration-300 ease-in-out bg-base-100 flex flex-col {activeView === 'links' ? 'translate-x-0' : 'translate-x-full'}">
        <div class="flex items-center p-4 sm:p-6 pb-2">
            <button type="button" class="btn btn-circle btn-ghost bg-base-200" on:click={() => activeView = 'hub'}><i class="bi bi-arrow-left text-xl"></i></button>
            <h2 class="text-xl font-bold ml-4">Document Links</h2>
        </div>
        <div class="flex-1 overflow-y-auto px-2 sm:px-6 pb-6">
            <QRurlScanner 
                on:success={(ev) => dispatch('success', ev.detail)}
                on:change={(ev) => linkCount = ev.detail.count}
            />
        </div>
        <div class="p-4 sm:p-6 bg-base-100 border-t border-base-200">
            <button type="button" class="btn btn-neutral btn-lg w-full rounded-xl shadow-sm" on:click={() => activeView = 'hub'}><i class="bi bi-check2-circle mr-2"></i> Done</button>
        </div>
    </div>

    <!-- DETAILS VIEW -->
    <div class="absolute inset-0 transition-transform duration-300 ease-in-out bg-base-100 flex flex-col {activeView === 'details' ? 'translate-x-0' : 'translate-x-full'}">
        <div class="flex items-center p-4 sm:p-6 pb-2">
            <button type="button" class="btn btn-circle btn-ghost bg-base-200" on:click={() => activeView = 'hub'}><i class="bi bi-arrow-left text-xl"></i></button>
            <h2 class="text-xl font-bold ml-4">Item Details</h2>
        </div>

        <div class="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
            <div class="flex flex-col gap-5">
                <div class="form-control w-full">
                    <label class="label"><span class="label-text font-semibold">Title</span></label>
                    <input type="text" name="title" placeholder="Leave blank for AI auto-fill..." class="input input-bordered w-full rounded-xl">
                </div>

                <div class="form-control w-full">
                    <label class="label"><span class="label-text font-semibold">Description</span></label>
                    <textarea name="description" rows="3" placeholder="Notes..." class="textarea textarea-bordered w-full rounded-xl"></textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="form-control w-full">
                        <label class="label"><span class="label-text font-semibold">Amount</span></label>
                        <input type="number" name="amount" placeholder="1" class="input input-bordered w-full rounded-xl">
                    </div>
                    <div class="form-control w-full">
                        <label class="label"><span class="label-text font-semibold">Tags</span></label>
                        <input type="text" name="tagcsv" placeholder="spare, tool..." class="input input-bordered w-full rounded-xl">
                    </div>
                </div>

                <div class="form-control w-full">
                    <label class="label"><span class="label-text font-semibold">Attributes</span></label>
                    <div class="bg-base-200/50 p-3 rounded-xl border border-base-200">
                        <AttributeAdder />
                    </div>
                </div>
            </div>
        </div>
        
        <div class="p-4 sm:p-6 bg-base-100 border-t border-base-200">
            <button type="button" class="btn btn-neutral btn-lg w-full rounded-xl shadow-sm" on:click={() => activeView = 'hub'}><i class="bi bi-check2-circle mr-2"></i> Done</button>
        </div>
    </div>
</div>