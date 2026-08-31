<script lang="ts">
    export let title: string = "";
    export let titleClass: string = "font-bold text-lg";
    export let boxClass: string = "bg-base-100 shadow-2xl";
    export let position: 'bottom' | 'middle' | 'top' = 'bottom';
    export let blur: boolean = true;
    
    let dialogNode: HTMLDialogElement;
    
    export function showModal() { dialogNode?.showModal(); }
    export function close() { dialogNode?.close(); }
</script>

<dialog bind:this={dialogNode} class="modal {position === 'top' ? 'modal-top sm:modal-middle' : (position === 'bottom' ? 'modal-bottom sm:modal-middle' : 'modal-middle')} {blur ? 'backdrop-blur-sm' : ''}" on:close>
    <div class="modal-box {boxClass}">
        {#if title}
            <h3 class="{titleClass} mb-4">{@html title}</h3>
        {/if}
        <slot />
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>