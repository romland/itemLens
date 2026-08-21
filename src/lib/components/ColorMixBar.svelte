<script lang="ts">
    import { parseColorMix } from "$lib/shared/colors";
    export let colorMixStr: string;

    $: mix = parseColorMix(colorMixStr);
</script>

{#if mix.length > 0}
    <div class="flex items-center gap-3 w-full">
        <div class="flex h-3 flex-1 rounded-full overflow-hidden shadow-inner border border-base-300 bg-base-200">
            {#each mix as m}
                <div style="width: {m.pct * 100}%; background-color: {m.hex};" class="h-full border-r border-base-300/50 last:border-0" title="{m.name} ({Math.round(m.pct * 100)}%)"></div>
            {/each}
        </div>
        <div class="text-xs text-gray-500 font-medium capitalize shrink-0">{mix.map(m => m.name).join(', ')}</div>
    </div>
{/if}
<!--{JSON.stringify(mix)}-->