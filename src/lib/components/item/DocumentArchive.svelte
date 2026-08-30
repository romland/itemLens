<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { enhance } from '$app/forms';
    import { marked } from 'marked';
    import { notify } from "$lib/client/notifications";
    import ConfirmModal from "$lib/components/ConfirmModal.svelte";

    export let documents: any[] = [];
    const dispatch = createEventDispatcher();
    let confirmModal: ConfirmModal;

    function alterSummary(txt: string) {
        if(!txt) return "";
        return marked.parse(txt, {gfm:true,breaks:true});
    }
</script>

<div role="tablist" class="tabs tabs-bordered w-full">
    {#each documents as doc, i}
        <div class="collapse collapse-arrow bg-base-200 mb-1">
            <input type="radio" name="my-accordion-2" checked={i===0} />
            <div class="collapse-title font-semibold bg-base-300">
                {doc.title}
            </div>
            <div class="collapse-content prose prose-sm max-w-none"> 
                {@html alterSummary(doc.summary)}

                <div class="flex justify-between items-center mt-2">
                    <div class="flex justify-start items-center gap-3 flex-1 min-w-0 pr-4">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 shrink-0">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                        
                        {#if doc.path.toLowerCase().endsWith('.epub')}
                            <button type="button" class="btn btn-sm btn-primary rounded-xl shrink-0" on:click={() => dispatch('openDoc', doc)}>
                                <i class="bi bi-book"></i> Read Book
                            </button>
                        {:else if doc.path.toLowerCase().match(/\.(md|txt)$/i) || doc.type === 'note'}
                            <button type="button" class="btn btn-sm btn-secondary rounded-xl shadow-sm shrink-0" on:click={() => dispatch('openDoc', doc)}>
                                <i class="bi bi-file-text"></i> Read Note
                            </button>
                        {:else if doc.path.toLowerCase().match(/\.(pdf|html|htm)$/i)}
                            <button type="button" class="btn btn-sm btn-outline border-base-300 rounded-xl bg-base-100 shadow-sm hover:border-primary shrink-0" on:click={() => dispatch('openDoc', doc)}>
                                <i class="bi bi-file-earmark"></i> View Document
                            </button>
                        {:else}
                            <a href="{doc.path || doc.source}" target="_blank" class="truncate max-w-[200px] sm:max-w-full block text-primary hover:underline font-medium shrink-0" title="{doc.source}">
                                {doc.source}
                            </a>
                        {/if}
                            
                        {#if doc.path && doc.path.match(/\.(epub|md|txt|pdf|html|htm)$/i) && doc.source && doc.source.startsWith('http')}
                            <span class="text-gray-300 shrink-0 hidden sm:inline mx-1">•</span>
                            <a href="{doc.source}" target="_blank" rel="noopener noreferrer" class="text-xs text-gray-500 hover:text-primary hover:underline truncate flex items-center gap-1 min-w-0 max-w-[150px] sm:max-w-[300px]" title="{doc.source}">
                                <i class="bi bi-link-45deg text-sm shrink-0"></i> <span class="truncate font-mono">{doc.source.replace(/^https?:\/\//, '')}</span>
                            </a>
                        {/if}
                    </div>

                    <form method="POST" action="?/deleteDocument" use:enhance={() => { return async ({ update }) => { await update(); notify('success', 'Document deleted.'); }; }}>
                        <input type="hidden" name="docId" value={doc.id}>
                        <button type="button" class="btn btn-sm btn-ghost text-error hover:bg-error/10 rounded-xl" title="Delete Document" on:click={async (e) => { const form = e.currentTarget.closest('form'); const res = await confirmModal.ask('Delete Document?', `Are you sure you want to permanently delete "${doc.title}"?`, 'Delete', 'Cancel', true); if (res) form.requestSubmit(); }}>
                            <i class="bi bi-trash3"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    {/each}
</div>

<ConfirmModal bind:this={confirmModal} />