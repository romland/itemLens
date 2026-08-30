<script lang="ts">
    import ItemSelectorModal from "$lib/components/ItemSelectorModal.svelte";

    export let item: any;
    export let activeTasks: any[] = [];

    let payloadModal: HTMLDialogElement;
    let payloadModalTitle = "";
    let payloadModalContent = "";
    function openPayloadModal(log: any) {
        payloadModalTitle = log.action;
        payloadModalContent = log.payload;
        payloadModal.showModal();
    }

    let devDebugModal: HTMLDialogElement;
    let diagnosticModal: HTMLDialogElement;
    let devDebugResult: any = null;
    let isDevDebugging = false;
    let selectorModal: ItemSelectorModal;
    let selectedTargetItem: any = null;

    async function runDevDebug() {
        if (!selectedTargetItem) return;
        isDevDebugging = true;
        try {
            const res = await fetch('/api/debug-match', {
                method: 'POST',
                body: JSON.stringify({ sourceId: item?.id, targetId: Number(selectedTargetItem.id) })
            });
            devDebugResult = await res.json();
        } finally {
            isDevDebugging = false;
        }
    }
</script>

<div class="border-b border-base-300 pb-3 mb-3 animate-fade-in mt-6">
    <div class="title font-bold mb-3 flex items-center justify-between">
        <span>Activity Log</span>
        <button class="btn btn-xs btn-ghost text-info" on:click={() => diagnosticModal.showModal()}><i class="bi bi-clipboard-data"></i> Diagnostics</button>
        <button class="btn btn-xs btn-ghost text-warning" on:click={() => devDebugModal.showModal()}><i class="bi bi-bug-fill"></i> Match Debugger</button>
    </div>
    <div class="bg-base-200/50 rounded-xl max-h-64 overflow-y-auto p-4 font-mono text-xs border border-base-200 shadow-inner">
        {#if item?.logs?.length > 0}
            <ul class="space-y-2">
                {#each item.logs as log}
                    <li class="flex items-start gap-3 border-b border-base-300/50 pb-2 last:border-0 last:pb-0">
                        <span class="text-gray-400 shrink-0 w-16">
                            {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span class="font-bold shrink-0 w-24 truncate {log.level === 'success' ? 'text-success' : log.level === 'warning' ? 'text-warning' : log.level === 'error' ? 'text-error' : 'text-info'}">
                            [{log.action}]
                        </span>
                        <span class="text-gray-600 break-words flex-1">
                            {log.message}
                            {#if log.payload}
                                <button type="button" class="btn btn-xs btn-outline btn-ghost ml-2 py-0 h-5 min-h-0 text-[10px]" on:click={() => openPayloadModal(log)}>View Details</button>
                            {/if}
                        </span>
                    </li>
                {/each}
            </ul>
        {:else}
            <div class="text-gray-400 italic">No background activity recorded.</div>
        {/if}
    </div>
</div>

<dialog bind:this={payloadModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box p-0 overflow-hidden bg-base-100 shadow-2xl border border-base-200 sm:rounded-[2.5rem] w-11/12 max-w-5xl flex flex-col max-h-[90vh]">
        <div class="p-6 pb-4 border-b border-base-200 bg-base-100/90 sticky top-0 z-10 flex justify-between items-center">
            <h3 class="font-bold text-lg leading-tight">{payloadModalTitle}</h3>
            <button class="btn btn-sm btn-circle btn-ghost" on:click={() => payloadModal.close()}><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="p-4 overflow-y-auto bg-base-200/50">
            <pre class="text-[10px] font-mono whitespace-pre-wrap break-words">{payloadModalContent}</pre>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<dialog bind:this={diagnosticModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box bg-base-100 shadow-2xl border border-info/50">
        <h3 class="font-bold text-lg mb-4 text-info"><i class="bi bi-clipboard-data"></i> Item Diagnostics</h3>
        <p class="text-xs mb-2">Copy this payload for debugging pending states.</p>
        <textarea class="textarea textarea-bordered w-full h-64 text-[10px] font-mono" readonly>{JSON.stringify({ photos: item?.photos, tasks: activeTasks }, null, 2)}</textarea>
        <div class="modal-action">
            <button class="btn" on:click={() => diagnosticModal.close()}>Close</button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<dialog bind:this={devDebugModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box bg-base-100 shadow-2xl border border-warning/50">
        <h3 class="font-bold text-lg mb-4 text-warning"><i class="bi bi-bug-fill"></i> Force Match Debugger</h3>
        <div class="form-control mb-4">
            <button type="button" class="btn btn-outline border-base-300 justify-start h-auto py-3 px-4 rounded-xl font-normal text-left" on:click={() => selectorModal.showModal()}>
                {#if selectedTargetItem}
                    <span class="font-bold">{selectedTargetItem.title}</span>
                {:else}
                    <span class="text-gray-400">Choose item to compare against...</span>
                {/if}
            </button>
        </div>
        <button class="btn btn-warning w-full" on:click={runDevDebug} disabled={isDevDebugging || !selectedTargetItem}>
            {#if isDevDebugging}<span class="loading loading-spinner"></span>{/if} Compare
        </button>
        
        {#if devDebugResult?.match}
            <div class="mt-4 p-4 bg-base-200 rounded-xl text-xs font-mono overflow-auto max-h-64 border border-base-300">
                <div class="font-bold mb-2 pb-2 border-b border-base-300">Score: <span class={devDebugResult.match.isMatch ? 'text-success' : 'text-error'}>{devDebugResult.match.score}</span> | isMatch: <span class={devDebugResult.match.isMatch ? 'text-success' : 'text-error'}>{devDebugResult.match.isMatch}</span></div>
                {#each devDebugResult.match.debugTrace as trace}
                    <div class="mb-1 py-0.5 border-b border-base-300/30 last:border-0">{trace}</div>
                {/each}
            </div>
        {/if}
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<ItemSelectorModal bind:this={selectorModal} title="Compare Debugger" subtitle="Browse or search all items (newest first)" on:select={(e) => {
    selectedTargetItem = e.detail;
    runDevDebug();
}} />