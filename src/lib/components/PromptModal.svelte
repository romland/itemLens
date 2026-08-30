<script lang="ts">
    import { createEventDispatcher, tick } from 'svelte';
    const dispatch = createEventDispatcher();
    
    import Modal from './Modal.svelte';
    import FormInput from './FormInput.svelte';

    export let title = "Input required";
    export let message = "";
    export let placeholder = "Enter value...";
    export let confirmText = "Save";
    export let cancelText = "Cancel";

    let dialog: Modal;
    let value = "";
    let resolvePromise: ((value: string | null) => void) | null = null;

    export async function ask(newTitle?: string, newMessage?: string, newPlaceholder?: string): Promise<string | null> {
        if (newTitle) title = newTitle;
        if (newMessage) message = newMessage;
        if (newPlaceholder) placeholder = newPlaceholder;
        value = "";
        
        dialog.showModal();
        await tick();
        document.getElementById('promptModalInput')?.focus();
        
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

<Modal bind:this={dialog} title="<i class='bi bi-input-cursor-text text-primary'></i> {title}" titleClass="font-bold text-xl flex items-center gap-2 mb-2" boxClass="sm:rounded-[2.5rem] border border-base-200" on:close={handleCancel}>
        {#if message}<p class="text-sm text-gray-500 mb-4 leading-relaxed">{@html message}</p>{/if}
        <form on:submit|preventDefault={handleConfirm} class="w-full">
            <FormInput id="promptModalInput" bind:value {placeholder} class="mb-6" inputClass="bg-base-200/50 focus:bg-base-100" />
            <div class="modal-action mt-0 flex gap-2 w-full">
                <button type="button" class="btn btn-ghost flex-1 rounded-xl" on:click={handleCancel}>{cancelText}</button>
                <button type="submit" class="btn btn-primary flex-1 rounded-xl shadow-md" disabled={!value.trim()}>{confirmText}</button>
            </div>
        </form>
</Modal>
