<script lang="ts">
    export let color: 'primary' | 'secondary' | 'accent' | 'ghost' | 'info' | 'success' | 'warning' | 'error' | 'neutral' | '' = '';
    export let size: 'xs' | 'sm' | 'md' | 'lg' = 'md';
    export let variant: 'solid' | 'outline' = 'solid';
    export let icon: string = "";
    export let removable: boolean = false;
    
    let className: string = "";
    export { className as class };
    
    $: colorClass = color ? `badge-${color}` : '';
    $: sizeClass = size !== 'md' ? `badge-${size}` : '';
    $: variantClass = variant === 'outline' ? 'badge-outline' : '';
    
    // Automatically use a <button> if we have an on:click handler or if it's a removable filter chip
    // Otherwise use an <a> if href exists, else a <span>
    $: tag = $$restProps.href ? 'a' : ($$props['on:click'] || $$props.onclick || removable ? 'button' : 'span');
</script>

<svelte:element
    this={tag}
    class="badge {colorClass} {sizeClass} {variantClass} {className} {icon || removable ? 'gap-1' : ''}"
    on:click
    {...$$restProps}
>
    {#if icon}<i class="bi {icon} shrink-0"></i>{/if}
    <slot />
    {#if removable}<i class="bi bi-x ml-1 shrink-0"></i>{/if}
</svelte:element>