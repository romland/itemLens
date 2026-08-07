<script>
    import { slide, fade } from 'svelte/transition';
    export let notifications = [];
</script>

{#if notifications.length > 0}
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-max max-w-[90vw]">
        {#each notifications as note (note.id)}
            <div transition:slide={{duration: 200}} class="pointer-events-auto flex items-center gap-3 px-4 py-2.5 bg-base-200/90 backdrop-blur-xl border border-base-content/10 rounded-full shadow-lg text-sm font-medium">
                {#if note.status === 'success'}
                    <i class="bi bi-check-circle-fill text-success text-lg"></i>
                {:else if note.status === 'error'}
                    <i class="bi bi-exclamation-circle-fill text-error text-lg"></i>
                {:else if note.status === 'loading'}
                    <span class="loading loading-spinner loading-xs text-primary"></span>
                {:else}
                    <i class="bi bi-info-circle-fill text-info text-lg"></i>
                {/if}
                <span class="truncate">{note.message}</span>
            </div>
        {/each}
    </div>
{/if}
