<script lang="ts">
    export let type: 'missing' | 'unregistered' | 'elsewhere' | 'correct';
</script>

<div class="text-center p-8 bg-base-200/40 rounded-3xl text-gray-400 flex flex-col items-center border border-base-200/50 shadow-sm animate-fade-in">
    {#if type === 'missing'}
        <i class="bi bi-check-circle-fill text-5xl mb-3 text-success drop-shadow-sm"></i>
        <h3 class="font-bold text-base-content text-lg mb-1">Perfect Match</h3>
        <p class="font-medium text-sm">Everything that belongs here is exactly where it should be.</p>
    {:else if type === 'unregistered'}
        <i class="bi bi-wallet2 text-5xl mb-3 text-primary drop-shadow-sm"></i>
        <h3 class="font-bold text-base-content text-lg mb-1">Safe Wallet</h3>
        <p class="font-medium text-sm">You already own everything in this photo!</p>
    {:else if type === 'elsewhere'}
        <i class="bi bi-box-seam text-5xl mb-3 text-info drop-shadow-sm"></i>
        <h3 class="font-bold text-base-content text-lg mb-1">No Intruders</h3>
        <p class="font-medium text-sm">Everything in this photo belongs exactly here.</p>
    {:else if type === 'correct'}
        <i class="bi bi-search text-5xl mb-3 text-gray-300 drop-shadow-sm"></i>
        <h3 class="font-bold text-base-content text-lg mb-1">No Matches</h3>
        <p class="font-medium text-sm">We couldn't find any of your items in this scan.</p>
    {/if}
</div>