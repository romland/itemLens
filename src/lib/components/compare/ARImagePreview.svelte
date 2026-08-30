<script lang="ts">
    export let src: string;
    export let boxes: { box: number[], colorClass: string, id: string }[] = [];
    
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();
</script>

<div class="relative w-full rounded-3xl overflow-hidden shadow-lg border border-base-200 bg-base-300">
    <img {src} alt="Scan preview" class="w-full h-auto block object-contain max-h-[40vh]" />
    
    {#each boxes as b}
        {#if b.box}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="absolute border-[3px] {b.colorClass} bg-transparent cursor-pointer transition-transform hover:scale-105 hover:bg-white/30 backdrop-contrast-125"
                 style="top:{b.box[0]/10}%; left:{b.box[1]/10}%; width:{(b.box[3]-b.box[1])/10}%; height:{(b.box[2]-b.box[0])/10}%"
                 on:click={() => dispatch('clickBox', b.id)}>
            </div>
        {/if}
    {/each}
</div>
