<script lang="ts">
    import { enhance } from "$app/forms";
    
    export let id: number;
    export let action: string;
    export let name: string;
    export let checked: boolean;
    export let label: string;
    export let disabled: boolean = false;
    export let enhanceFn: any;
    
    export let type: 'toggle' | 'checkbox' = 'toggle';
    export let payloadType: 'direct' | 'field' = 'direct';
    export let formClass: string = "mt-2 flex items-center gap-2";
</script>

<form method="POST" {action} use:enhance={enhanceFn} class={formClass}>
    <input type="hidden" name="id" value={id}>
    {#if payloadType === 'field'}
        <input type="hidden" name="field" value={name}>
        <input type="hidden" name="value" value={(!checked).toString()}>
    {:else}
        <input type="hidden" {name} value={(!checked).toString()}>
    {/if}
    
    {#if type === 'checkbox'}
        <input type="checkbox" class="checkbox checkbox-xs checkbox-primary shrink-0" {checked} {disabled} on:change={(e) => e.currentTarget.form?.requestSubmit()} />
    {:else}
        <input type="checkbox" class="toggle toggle-xs toggle-primary shrink-0" {checked} {disabled} on:change={(e) => e.currentTarget.form?.requestSubmit()} />
    {/if}
    <span class="text-xs text-gray-500 font-medium leading-tight" class:opacity-50={disabled}>{label}</span>
</form>