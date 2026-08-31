<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let options: { value: string | number, label: string }[] = [];
    export let value: string | number | null = null;
    export let buttonClass: string = "btn-sm btn-ghost bg-base-200/50 hover:bg-base-300 font-bold rounded-xl gap-2 shadow-sm border border-base-300";
    export let menuClass: string = "w-56 bg-base-100/95 backdrop-blur-xl rounded-xl border border-base-200 mt-2 gap-1 max-h-[60vh] overflow-y-auto flex-nowrap";
    export let dropdownClass: string = "dropdown-bottom";
    export let chevronClass: string = "bi-chevron-down text-[10px] opacity-50";
    export let labelPrefix: string = "";
    
    // Form submission behavior
    export let name: string = "";
    export let formAction: string = "";
    export let reload: boolean = false;

    function handleSelect(optValue: string | number, e: MouseEvent) {
        value = optValue;
        dispatch('change', optValue);
        
        if (!formAction && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    }
    
        function handleInteraction(e: MouseEvent | TouchEvent) {
            const btn = e.currentTarget as HTMLButtonElement;
            if (document.activeElement === btn) {
                e.preventDefault();
                btn.blur();
            }
        }

    $: selectedLabel = options.find(o => String(o.value) === String(value))?.label || 'Select...';
</script>

<div class="dropdown {dropdownClass}">
        <button type="button" tabindex="0" class="btn {buttonClass}" on:mousedown={handleInteraction} on:touchstart={handleInteraction}>
        <span class="truncate">{labelPrefix}{selectedLabel}</span>
        <i class="bi {chevronClass} shrink-0"></i>
    </button>
    <ul tabindex="0" class="dropdown-content z-[100] menu p-2 shadow-2xl {menuClass}">
        <slot name="header" />
        {#each options as opt}
            <li>
                {#if formAction}
                    <form action={formAction} method="POST" data-sveltekit-reload={reload ? '' : null} class="w-full m-0 p-0 block">
                        <input type="hidden" {name} value={opt.value}>
                        <button type="submit" class="w-full justify-between font-medium {String(opt.value) === String(value) ? 'text-primary bg-primary/10' : ''}">
                            <span class="truncate">{opt.label}</span>
                            {#if String(opt.value) === String(value)}
                                <i class="bi bi-check-lg shrink-0"></i>
                            {/if}
                        </button>
                    </form>
                {:else}
                    <button type="button" class="w-full justify-between font-medium {String(opt.value) === String(value) ? 'text-primary bg-primary/10' : ''}" on:click={(e) => handleSelect(opt.value, e)}>
                        <span class="truncate">{opt.label}</span>
                        {#if String(opt.value) === String(value)}
                            <i class="bi bi-check-lg shrink-0"></i>
                        {/if}
                    </button>
                {/if}
            </li>
        {/each}
        <slot name="footer" />
    </ul>
    {#if !formAction && name}
        <input type="hidden" {name} {value}>
    {/if}
</div>