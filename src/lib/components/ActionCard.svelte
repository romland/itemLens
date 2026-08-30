<script lang="ts">
    export let title: string;
    export let subtitle: string = "";
    export let icon: string = "";
    export let iconColorClass: string = "bg-base-200 text-base-content";
    export let href: string = "";
    export let buttonClass: string = "";
    export let target: string = "";
    export let showChevron: boolean = true;
    export let variant: 'outline' | 'flat' = 'outline';
    export let type: string = "button";
    export let size: 'sm' | 'md' = 'md';
    let className: string = "";
    export { className as class };
    
    $: baseClass = variant === 'outline' 
        ? `btn btn-outline h-auto ${size === 'sm' ? 'py-2.5 px-3' : 'py-4 px-4'} w-full flex justify-between items-center rounded-xl cursor-pointer ${buttonClass || 'border-base-300 hover:border-primary hover:bg-base-50'} ${className}`
        : `flex items-center justify-between gap-4 p-4 hover:bg-base-200 transition-colors active:bg-base-300 w-full text-left cursor-pointer ${buttonClass} ${className}`;
        
    $: iconSize = size === 'sm' ? 'w-6 h-6 text-xs' : (variant === 'outline' ? 'w-12 h-12 text-xl' : 'w-10 h-10 text-xl');
    $: titleClass = size === 'sm' ? 'text-xs' : (variant === 'outline' ? 'text-base' : 'text-lg');
    $: gapClass = size === 'sm' ? 'gap-3' : 'gap-4';
</script>

<svelte:element 
    this={href ? 'a' : 'button'} 
    type={href ? undefined : type}
    {href} 
    target={target || undefined}
    class={baseClass} 
    on:click
    {...$$restProps}
>
    <div class="flex items-center {gapClass} flex-1 min-w-0">
        <div class="{iconColorClass} {iconSize} rounded-full flex items-center justify-center shrink-0">
            <i class="bi {icon}"></i>
        </div>
        <div class="text-left flex-1 min-w-0 flex flex-col justify-center">
            <div class="font-bold {titleClass} leading-tight truncate">
                {title}
            </div>
            {#if subtitle}
                <div class="text-[10px] sm:text-xs text-gray-500 font-normal truncate">{subtitle}</div>
            {/if}
        </div>
    </div>
    <div class="flex items-center gap-1 flex-wrap justify-end shrink-0 pl-2">
        <slot />
        {#if showChevron}
            <i class="bi bi-chevron-right text-gray-400"></i>
        {/if}
    </div>
</svelte:element>