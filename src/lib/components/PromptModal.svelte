<script lang="ts">
    import { createEventDispatcher, tick } from 'svelte';
    const dispatch = createEventDispatcher();
    
    export let title = "Input required";
    export let message = "";
    export let placeholder = "Enter value...";
    export let confirmText = "Save";
    export let cancelText = "Cancel";

    let dialog: HTMLDialogElement;
    let inputEl: HTMLInputElement;
    let value = "";
    let resolvePromise: ((value: string | null) => void) | null = null;

    export async function ask(newTitle?: string, newMessage?: string, newPlaceholder?: string): Promise<string | null> {
        if (newTitle) title = newTitle;
        if (newMessage) message = newMessage;
        if (newPlaceholder) placeholder = newPlaceholder;
        value = "";
        
        dialog.showModal();
        await tick();
        inputEl?.focus();
        
        return new Promise((resolve) => {
            resolvePromise = resolve;
        });
    }

    function handleConfirm() {
        dialog.close();
        if (resolvePromise) resolvePromise(value);
        dispatch('submit', value);
    }

    function handleCancel() {
        dialog.close();
        if (resolvePromise) resolvePromise(null);
        dispatch('cancel');
    }
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle backdrop-blur-sm" on:close={handleCancel}>
    <div class="modal-box bg-base-100 shadow-2xl border border-base-200 sm:rounded-[2.5rem]">
        <h3 class="font-bold text-xl mb-2 flex items-center gap-2">
            <i class="bi bi-input-cursor-text text-primary"></i> {title}
        </h3>
        {#if message}<p class="text-sm text-gray-500 mb-4 leading-relaxed">{@html message}</p>{/if}
        <form on:submit|preventDefault={handleConfirm} class="w-full">
            <input bind:this={inputEl} type="text" bind:value {placeholder} class="input input-bordered w-full rounded-xl mb-6 bg-base-200/50 focus:bg-base-100" />
            <div class="modal-action mt-0 flex gap-2 w-full">
                <button type="button" class="btn btn-ghost flex-1 rounded-xl" on:click={handleCancel}>{cancelText}</button>
                <button type="submit" class="btn btn-primary flex-1 rounded-xl shadow-md" disabled={!value.trim()}>{confirmText}</button>
            </div>
        </form>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>