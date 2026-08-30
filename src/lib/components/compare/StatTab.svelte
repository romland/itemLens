<script lang="ts">
    export let active: boolean = false;
    export let count: number = 0;
    export let label: string;
    export let icon: string;
    export let activeColorClass: string = "text-primary";
    export let sublabel: string = "";
    export let loading: boolean = false;
</script>

<button 
    type="button" 
    class="btn btn-sm h-auto py-2 flex-1 min-w-[130px] rounded-xl border-none transition-all flex flex-wrap items-center justify-center gap-1 {active ? `bg-base-100 shadow-sm font-bold ${activeColorClass}` : 'btn-ghost text-gray-500 font-medium hover:bg-base-300/50'}" 
    on:click
>
    <div class="flex flex-col items-center leading-tight">
        <span class="flex items-center gap-1">
            {#if loading}
                <span class="loading loading-spinner loading-xs"></span>
            {:else}
                {@html icon}
            {/if} 
            {label}
        </span>
        {#if sublabel}
            <span class="text-[9px] opacity-70 max-w-[100px] truncate">{sublabel}</span>
        {/if}
    </div>
    <span class="badge badge-sm badge-outline bg-base-100/50 border-gray-300/50">{count}</span>
</button>