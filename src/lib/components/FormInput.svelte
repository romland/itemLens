<script lang="ts">
    export let label: string = "";
    export let name: string = "";
    export let value: string | number = "";
    export let placeholder: string = "";
    export let type: string = "text";
    export let hint: string = "";
    export let icon: string = "";
    export let required: boolean = false;
    export let inputClass: string = "rounded-xl";
    export let labelClass: string = "font-semibold";
    let className: string = "";
    export { className as class };

    $: isFile = type === 'file';
    $: isTextarea = type === 'textarea';
    $: baseInputClass = isFile ? `file-input file-input-bordered w-full ${inputClass}` : (isTextarea ? `textarea textarea-bordered w-full ${inputClass}` : `input input-bordered w-full ${icon ? 'pl-12' : ''} ${inputClass}`);

</script>

<div class="form-control {className || 'w-full'}">
    {#if label}
        <div class="label pb-1 pt-0"><span class="label-text {labelClass}">{@html label}</span></div>
    {/if}
    <div class="relative w-full">
        {#if icon}
            <i class="bi {icon} absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none"></i>
        {/if}
        {#if isTextarea}
            <textarea {name} bind:value {placeholder} {required} class="{baseInputClass}" {...$$restProps} on:input on:change on:blur on:focus on:keydown on:paste></textarea>
        {:else if isFile}
            <input {type} {name} {required} class="{baseInputClass}" {...$$restProps} on:change on:paste>
        {:else}
            <input 
                {type} 
                {name} 
                bind:value 
                {placeholder} 
                {required} 
                class="{baseInputClass}" 
                {...$$restProps}
                on:input
                on:change
                on:blur
                on:focus
                on:keydown
                on:paste
            >
        {/if}
        <slot />
    </div>
    {#if hint}
        <div class="label pt-1 pb-0"><span class="label-text-alt text-gray-500">{@html hint}</span></div>
    {/if}
</div>
