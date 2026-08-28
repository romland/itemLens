<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import ItemMiniCard from "$lib/components/ItemMiniCard.svelte";
    export let documents: any[] = [];

    const dispatch = createEventDispatcher();

    function handleDocumentClick(e: MouseEvent, doc: any) {
        const path = (doc.path || doc.source || '').toLowerCase().split('#')[0];
        
        if (path.match(/\.(epub|pdf|html|htm|txt|md|csv)$/i)) {
            e.preventDefault();
            dispatch('openDoc', doc);
        } else if (path.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            e.preventDefault();
            dispatch('openImage', { orgPath: doc.path || doc.source, showOriginal: true });
        }
    }

    function getFileInfo(doc: any) {
        const path = (doc.path || '').toLowerCase().split('#')[0];
        const source = (doc.source || '').toLowerCase();
        
        if (path.endsWith('.pdf')) return { icon: 'bi-filetype-pdf', label: 'PDF' };
        if (path.endsWith('.epub')) return { icon: 'bi-book', label: 'EPUB' };
        if (path.match(/\.(mp4|webm|mov|mkv)$/i)) return { icon: 'bi-filetype-mp4', label: 'VIDEO' };
        if (path.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return { icon: 'bi-image', label: 'IMAGE' };
        if (path.endsWith('.html') || source.startsWith('http')) return { icon: 'bi-globe', label: 'WEB' };
        if (doc.type === 'note') return { icon: 'bi-sticky', label: 'NOTE' };
        
        const match = path.match(/\.([a-z0-9]+)$/i);
        if (match) return { icon: 'bi-file-earmark-text', label: match[1].toUpperCase() };
        
        return { icon: 'bi-file-earmark-text', label: 'DOC' };
    }
</script>

<div class="flex flex-col gap-2 pb-32 animate-fade-in px-2 sm:px-0">
    {#each documents as doc}
        {@const info = getFileInfo(doc)}
        <div class="flex flex-row p-3 sm:p-5 hover:bg-base-200/40 rounded-2xl sm:rounded-3xl transition-all border border-base-200 shadow-sm bg-base-100 group relative gap-3 sm:gap-6 items-start sm:items-center">
            
            <!-- Invisible hit-target -->
            <a href="{doc.path || doc.source}" target="_blank" rel="noopener noreferrer" class="absolute inset-0 z-0 rounded-2xl sm:rounded-3xl outline-none" aria-label="View Document" on:click={(e) => handleDocumentClick(e, doc)}></a>
            
            <!-- Icon (Left Column) -->
            <div class="shrink-0 relative z-10 pointer-events-none mt-0.5 sm:mt-0">
                <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-base-200 flex items-center justify-center text-base-content/60 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <i class="{info.icon} text-xl sm:text-2xl"></i>
                </div>
            </div>

            <!-- Content (Middle Column) -->
            <div class="flex-1 flex flex-col min-w-0 relative z-10 pointer-events-none justify-center">
                
                <!-- Title & Badge -->
                <div class="flex justify-between items-start gap-2">
                    <span class="font-bold text-sm sm:text-base text-base-content leading-tight line-clamp-2 sm:truncate">{doc.title}</span>
                    <span class="shrink-0 text-[9px] font-bold uppercase tracking-wider text-base-content/50 bg-base-200 px-1.5 py-0.5 rounded-md border border-base-300 mt-0.5 sm:mt-0">{info.label}</span>
                </div>

                <!-- Excerpt -->
                {#if doc.excerpt}
                    <div class="text-xs sm:text-sm text-base-content/70 mt-1 leading-snug line-clamp-1 sm:line-clamp-2">
                        {@html doc.excerpt}
                    </div>
                {/if}

                <!-- Inline Metadata (Source & Attached Item) - Highly Compact -->
                <div class="flex items-center gap-1.5 text-[10px] sm:text-xs text-base-content/50 mt-1.5 truncate w-full font-medium">
                    {#if doc.item}
                        <span class="text-primary/80 shrink-0 md:hidden flex items-center gap-1"><i class="bi bi-paperclip"></i> {doc.item.title}</span>
                        {#if doc.source}<span class="opacity-50 shrink-0 md:hidden">•</span>{/if}
                    {/if}
                    {#if doc.source}
                        <span class="truncate font-mono flex items-center gap-1"><i class="bi bi-link"></i> {doc.source}</span>
                    {/if}
                </div>

            </div>

            <!-- Desktop-only Attached Item Context (Right Column) -->
            {#if doc.item}
                <div class="hidden md:flex w-64 shrink-0 relative z-10 pointer-events-auto border-l border-base-200 pl-6 flex-col justify-center">
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