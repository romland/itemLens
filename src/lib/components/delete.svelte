<script lang="ts">
    import { enhance } from "$app/forms";
    import { goto } from "$app/navigation";

	let dialog: HTMLDialogElement;
	export let action: string;
	export let message: string;
    export let btnClass: string = "text-gray-500 hover:text-error";
    export let iconClass: string = "bi bi-trash";
</script>

<button type="button" title="Delete Item" class={btnClass} on:click={() => dialog.show()}><i class={iconClass}></i></button>

<dialog bind:this={dialog} class="modal">
    <form {action} method="post" class="modal-box" use:enhance={() => {
        return async ({ result, update }) => {
            if (result.type === 'success' && result.data?.deleted) {
                dialog.close();
                history.back();
                setTimeout(() => { if (window.location.pathname.includes('/delete')) goto('/'); }, 100);
            } else {
                await update();
            }
        };
    }}>
        <h3 class="font-bold text-lg">Confirm</h3>
        <p class="py-4">{@html message}</p>
        <div class="modal-action">
            <button type="button" class="btn btn-neutral btn-sm" on:click|preventDefault={() => dialog.close()}>No</button>
            <button type="submit" class="btn btn-error btn-sm">Yes</button>
        </div>
    </form>
</dialog>

<style>
    .menu-delete-btn::after {
        margin-left: 0;
    }
</style>