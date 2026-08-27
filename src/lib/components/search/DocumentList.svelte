<script lang="ts">
    import ItemMiniCard from "$lib/components/ItemMiniCard.svelte";
    export let documents: any[] = [];
</script>

<div class="flex flex-col gap-3 pb-32 animate-fade-in">
    {#each documents as doc}
        <div class="flex flex-col md:flex-row p-4 sm:p-5 hover:bg-base-200/40 rounded-3xl transition-all border border-base-200 shadow-sm bg-base-100 group relative gap-4 sm:gap-6">
            <!-- Invisible hit-target -->
            <a href="{doc.path || doc.source}" target="_blank" rel="noopener noreferrer" class="absolute inset-0 z-0 rounded-3xl outline-none" aria-label="View Document"></a>
            
            <!-- Desktop Icon (Left Column) -->
            <div class="hidden sm:flex shrink-0 relative z-10 pointer-events-none">
                <div class="w-12 h-12 rounded-2xl bg-base-200 flex items-center justify-center text-base-content/40 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <i class="bi bi-file-earmark-text text-2xl"></i>
                </div>
            </div>

            <!-- Content (Middle Column) -->
            <div class="flex-1 flex flex-col min-w-0 relative z-10 pointer-events-none justify-center">
                <!-- Mobile Icon + Title Row -->
                <div class="flex items-center gap-3">
                    <div class="sm:hidden w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center text-base-content/40 shrink-0">
                        <i class="bi bi-file-earmark-text text-lg"></i>
                    </div>
                    <div class="flex flex-col min-w-0">
                        <span class="font-semibold text-base text-base-content truncate">{doc.title}</span>
                        {#if doc.source}
                            <span class="text-xs text-base-content/40 font-mono truncate mt-0.5 flex items-center gap-1.5"><i class="bi bi-link"></i> {doc.source}</span>
                        {/if}
                    </div>
                </div>

                {#if doc.excerpt}
                    <div class="text-sm text-base-content/70 mt-3 sm:mt-2 leading-relaxed">
                        {@html doc.excerpt}
                    </div>
                {/if}
            </div>

            <!-- Attached Item Context (Right Column) -->
            {#if doc.item}
                <div class="w-full md:w-64 shrink-0 relative z-10 pointer-events-auto border-t md:border-t-0 md:border-l border-base-200 pt-4 md:pt-0 md:pl-6 flex flex-col justify-center">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-base-content/40 mb-2.5 flex items-center gap-1.5">
                        <i class="bi bi-paperclip text-sm"></i> Attached To
                    </div>
                    <div class="pointer-events-auto relative z-20">
                        <ItemMiniCard item={doc.item} />
                    </div>
                </div>
            {/if}
        </div>
    {/each}
    
    {#if documents.length === 0}
        <div class="text-center py-12 text-base-content/40">No document matches found for this query.</div>
    {/if}
</div>
