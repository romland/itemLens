<script lang="ts">
    import { enhance } from '$app/forms';
    import { marked } from 'marked';

    export let note;
    
    let isEditing = false;
    let editContent = "";

    function formatTime(dateStr: string) {
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.toLocaleDateString();
    }

    function getDocSnippet(doc: any) {
        if (doc.summary) return doc.summary;
        if (doc.extracts && doc.extracts !== '[]') {
            try {
                const parsed = JSON.parse(doc.extracts);
                if (parsed.length > 0) return parsed[0];
            } catch(e) {}
        }
        return "";
    }    
</script>

<div class="card bg-base-100 shadow-sm border border-base-200 w-full overflow-visible">
    <!-- Top Header: Time, Tag, and Menu -->
    <div class="flex justify-between items-center px-4 pt-3 pb-1 text-[10px] text-gray-400 font-medium uppercase tracking-wider">
        <div class="flex items-center gap-2">
            <span>{formatTime(note.createdAt)}</span>
            {#if note.latitude}
                <span class="text-primary"><i class="bi bi-geo-alt-fill"></i></span>
            {/if}
        </div>
        
        <div class="dropdown dropdown-end">
            <button tabindex="0" class="btn btn-ghost btn-xs btn-circle text-gray-400 hover:text-primary">
                <i class="bi bi-three-dots"></i>
            </button>
            <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-40 border border-base-200">
                <li><button on:click={() => { editContent = note.content || ""; isEditing = true; }}><i class="bi bi-pencil"></i> Edit</button></li>
                <li>
                    <form action="/timeline?/delete" method="POST" use:enhance class="m-0 p-0 w-full">
                        <input type="hidden" name="id" value={note.id}>
                        <button type="submit" class="text-error w-full text-left"><i class="bi bi-trash"></i> Delete</button>
                    </form>
                </li>
            </ul>
        </div>
    </div>
    <!-- Attached Photos -->
    {#if note.photos && note.photos.length > 0}
        <div class="flex overflow-x-auto snap-x bg-base-200 border-b border-base-200 max-h-64" style="-ms-overflow-style: none; scrollbar-width: none;">
            {#each note.photos as photo}
                <div class="shrink-0 w-full h-full snap-center">
                    <img src={photo.thumbPath || photo.orgPath} alt="Attachment" class="w-full h-full object-cover" />
                </div>
            {/each}
        </div>
    {/if}

    <div class="card-body p-4 pt-2">
        <!-- Text Content -->
        {#if isEditing}
            <form action="/timeline?/edit" method="POST" use:enhance={() => { return async ({ update }) => { await update(); isEditing = false; }}}>
                <input type="hidden" name="id" value={note.id}>
                <textarea name="content" bind:value={editContent} class="textarea textarea-bordered w-full text-sm leading-snug"
                    on:keydown={(e) => {
                        if (e.key === 'Escape') isEditing = false;
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
                    }}
                ></textarea>
                <div class="flex justify-end gap-2 mt-2">
                    <button type="button" class="btn btn-ghost btn-sm" on:click={() => isEditing = false}>Cancel</button>
                    <button type="submit" class="btn btn-primary btn-sm">Save</button>
                </div>
            </form>
        {:else}
            {#if note.content}
                <div class="prose prose-sm max-w-none text-base-content leading-snug break-words">
                    {@html marked.parse(note.content, { breaks: true })}
                </div>
            {/if}
        {/if}

        <!-- Rich Document/Link Previews -->
        {#if note.documents && note.documents.length > 0}
            <div class="flex flex-col gap-2 {note.content ? 'mt-3' : ''}">
                {#each note.documents as doc}
                    <a href={doc.source} target="_blank" rel="noopener noreferrer" class="flex flex-col border border-base-200 bg-base-200/30 rounded-xl p-3 hover:border-primary/50 transition-colors no-underline">
                        <div class="flex items-start gap-3">
                            <div class="bg-base-300 text-gray-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                                <i class="bi {doc.type === 'note' ? 'bi-file-text' : 'bi-link-45deg'} text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-bold text-sm text-base-content line-clamp-1 m-0">{doc.title || doc.source}</h4>
                                <p class="text-[10px] text-primary line-clamp-1 m-0 mt-0.5">{doc.source}</p>
                            </div>
                        </div>
                        {#if getDocSnippet(doc)}
                            <div class="mt-2 text-xs text-gray-500 line-clamp-3 leading-relaxed">
                                {getDocSnippet(doc).replace(/<[^>]+>/g, '')}
                            </div>
                        {/if}
                    </a>
                {/each}
            </div>
        {/if}        

        <!-- Metadata Footer -->
        <div class="flex justify-between items-center mt-3 pt-3 border-t border-base-200/50">
            <form action="/timeline?/updateCategory" method="POST" use:enhance class="m-0 p-0">
                <input type="hidden" name="id" value={note.id}>
                <select name="category" class="select select-ghost select-xs text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-primary focus:outline-none px-0" value={note.category} on:change={(e) => e.currentTarget.form?.requestSubmit()}>
                    <option value="idea">💡 Idea</option>
                    <option value="todo">✅ Todo</option>
                    <option value="to buy">🛒 To Buy</option>
                    <option value="other">📌 Other</option>
                </select>
            </form>
            <button class="btn btn-xs btn-ghost text-gray-500 hover:text-primary gap-1">
                <i class="bi bi-box-arrow-in-right"></i> Promote to Item
            </button>
        </div>
    </div>
</div>