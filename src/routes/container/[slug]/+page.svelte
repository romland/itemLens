<script lang="ts">
    import type { PageServerData } from "./$types";
    import { goto } from "$app/navigation";
    import Delete from "$lib/components/delete.svelte";
    import Items from "$lib/components/items.svelte";
    import Navigation from "$lib/components/navigation.svelte";

    export let data: PageServerData;

    import pageTitle from '$lib/stores';
    pageTitle.set("Container " + data.item?.name);

    // Calculate tray breakdown
    $: childItemCount = data.items.filter(i => i.locations.some(l => l.container?.name !== data.item?.name)).length;
    $: directItemCount = data.items.length - childItemCount;
</script>

<article style="padding-bottom: 100px;" class="max-w-4xl mx-auto">

    <div class="relative w-full rounded-[2rem] overflow-hidden bg-base-200 border border-base-300 mb-8 shadow-sm group min-h-[250px] sm:min-h-[300px] flex items-end">
        {#if data.item?.photoPath}
            <!-- Blurred background -->
            <img src="{data.item.photoPath}" alt="Background" class="absolute inset-0 w-full h-full object-cover blur-xl opacity-40 scale-110" />
            <!-- Crisp foreground -->
            <div class="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/60 to-transparent"></div>
            <img src="{data.item.photoPath}" alt="{data.item.name}" class="absolute right-0 top-1/2 -translate-y-1/2 h-[120%] object-contain opacity-50 sm:opacity-100 sm:right-8 sm:h-[90%] drop-shadow-2xl mix-blend-overlay sm:mix-blend-normal pointer-events-none" />
        {/if}
        
        <div class="relative z-10 p-6 sm:p-10 w-full">
            <div class="flex justify-between items-start gap-4">
                <div class="flex-1">
                    <div class="badge badge-primary badge-sm font-mono mb-3 shadow-sm">{data.item?.name}</div>
                    <h1 class="text-4xl sm:text-5xl font-bold tracking-tight mb-2 text-base-content drop-shadow-sm">{data.item?.name}</h1>
                    
                    <div class="flex items-center gap-4 text-sm font-medium text-base-content/70 flex-wrap">
                        {#if data.item?.location}
                            <span class="flex items-center gap-1"><i class="bi bi-geo-alt-fill text-primary"></i> {data.item.location}</span>
                        {/if}
                        <span class="flex items-center gap-1"><i class="bi bi-box"></i> {data.items.length} Items</span>
                        {#if data.item?.children?.length > 0}
                            <span class="flex items-center gap-1"><i class="bi bi-grid-3x3-gap"></i> {data.item.children.length} Trays</span>
                        {/if}
                    </div>

                    {#if data.item?.description}
                        <p class="mt-4 text-base-content/80 max-w-lg leading-relaxed">{data.item.description}</p>
                    {/if}
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2 shrink-0">
                    <a href="/container/{encodeURIComponent(data.item?.name || '')}/edit" class="btn btn-circle btn-ghost bg-base-100/50 backdrop-blur-md hover:bg-base-100 transition-colors" title="Edit Container">
                        <i class="bi bi-pencil-square text-lg"></i>
                    </a>
                    <!-- Delete wrapped safely -->
                    <div class="bg-base-100/50 backdrop-blur-md hover:bg-error/20 transition-colors rounded-full">
                        <Delete message='Delete this container?' action='/container/{encodeURIComponent(data.item?.name || '')}/delete' btnClass="btn btn-circle btn-ghost text-error" iconClass="bi bi-trash text-lg" />
                    </div>
                </div>
            </div>
        </div>
    </div>

    {#if data.item?.children?.length > 0}
        <!-- Child Trays -->
        <div class="mb-8">
            <h3 class="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3 ml-2 flex items-center gap-2"><i class="bi bi-ui-checks"></i> Nested Trays</h3>
            <div class="flex flex-wrap gap-2">
                {#each data.item.children as tray}
                    <a href="/container/{encodeURIComponent(tray.name)}" class="badge badge-lg p-4 bg-base-200 hover:bg-primary hover:text-primary-content border border-base-300 transition-colors shadow-sm cursor-pointer font-mono text-sm">
                        {tray.name}
                    </a>
                {/each}
            </div>
        </div>
    {/if}

    <!-- Items inside -->
    <div>
        <div class="flex justify-between items-end mb-4 ml-2">
            <h2 class="text-xl font-bold tracking-tight">Items in Location</h2>
            {#if data.item?.children?.length > 0}
                <label class="cursor-pointer flex items-center gap-2 text-sm text-gray-500 font-medium hover:text-primary">
                    <input type="checkbox" class="checkbox checkbox-xs checkbox-primary" checked={data.includeTrays} on:change={(e) => {
                        const url = new URL(window.location.href);
                        if (e.currentTarget.checked) url.searchParams.set('includeTrays', 'true'); else url.searchParams.delete('includeTrays');
                        goto(url.search, { invalidateAll: true, keepFocus: true });
                    }} />
                    Include nested trays
                </label>
            {/if}
        </div>
        <div class="bg-base-100 rounded-[1.5rem] border border-base-200 shadow-sm overflow-hidden p-2">
            <Items items={data.items} />
        </div>
        <Navigation href={data.apiPath} prevPage={data.prevPage} nextPage={data.nextPage} />
    </div>

</article>
