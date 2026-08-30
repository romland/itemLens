<script lang="ts">
    export let icon: string = "";
    export let colorClass: string = "text-secondary";
    export let href: string = "";
    export let target: string = "";
    export let isMono: boolean = false;
    
    const baseClass = `text-[10px] font-bold uppercase tracking-wider hover:underline flex items-center gap-1 min-w-0 max-w-[150px] sm:max-w-[250px] ${colorClass}`;
</script>

{#if href}
    <a {href} target={target || undefined} rel={target === '_blank' ? 'noopener noreferrer' : undefined} class="{baseClass}" {...$$restProps}>
        {#if icon}<i class="bi {icon} shrink-0"></i>{/if}
        <span class="truncate {isMono ? 'normal-case tracking-normal font-mono' : ''}"><slot /></span>
    </a>
{:else}
    <button type="button" class="{baseClass} p-0 border-none bg-transparent cursor-pointer" on:click {...$$restProps}>
        {#if icon}<i class="bi {icon} shrink-0"></i>{/if}
        <span class="truncate {isMono ? 'normal-case tracking-normal font-mono' : ''}"><slot /></span>
    </button>
{/if}