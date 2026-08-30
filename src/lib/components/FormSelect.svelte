<script lang="ts">
    export let label: string = "";
    export let name: string = "";
    export let value: any = undefined;
    export let hint: string = "";
    export let selectClass: string = "rounded-xl";
    export let labelClass: string = "font-semibold";
    let className: string = "";
    export { className as class };
</script>

<div class="form-control w-full {className}">
    {#if label}
        <div class="label pb-1 pt-0"><span class="label-text {labelClass}">{@html label}</span></div>
    {/if}
    <select {name} class="select select-bordered w-full {selectClass}" bind:value {...$$restProps} on:change>
        <slot />
    </select>
    {#if hint}
        <div class="label pt-1 pb-0"><span class="label-text-alt text-gray-500">{@html hint}</span></div>
    {/if}
</div>
