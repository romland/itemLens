<script>
    export let notifications = [];
</script>

{#if notifications.length > 0}
    <div style="position: absolute; top: 0; left: 0; z-index: 2;" class="w-full">
        {#each notifications as note}
            <div role="alert" class="alert alert-{note.status} md-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{note.message}</span>
            </div>
        {/each}
    </div>
{/if}
