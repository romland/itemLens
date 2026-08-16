<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';

    export let containers: any[] = [];
    const dispatch = createEventDispatcher();

    export let scopeType: 'all' | 'tag' | 'container' = 'all';
    export let scopeValue = '';

    let quickScopes: { type: 'all' | 'tag' | 'container'; value: string; label: string }[] = [];
    let customInput = '';

    onMount(() => {
        try {
            const saved = localStorage.getItem('itemlens_quick_scopes');
            if (saved) quickScopes = JSON.parse(saved);
        } catch (e) {}
        notifyChange();
    });

    function notifyChange() {
        dispatch('change', { scopeType, scopeValue });
    }

    function selectScope(type: 'all' | 'tag' | 'container', value = '') {
        scopeType = type;
        scopeValue = value;
        notifyChange();
    }

    function toggleSaveQuickScope() {
        const label = scopeType === 'all' ? 'Everything' : scopeType === 'tag' ? `#${scopeValue}` : `Box: ${scopeValue}`;
        const exists = quickScopes.some(s => s.type === scopeType && s.value === scopeValue);
        if (exists) {
            quickScopes = quickScopes.filter(s => !(s.type === scopeType && s.value === scopeValue));
        } else {
            quickScopes = [...quickScopes, { type: scopeType, value: scopeValue, label }];
        }
        try { localStorage.setItem('itemlens_quick_scopes', JSON.stringify(quickScopes)); } catch (e) {}
    }

    $: isCurrentScopeSaved = quickScopes.some(s => s.type === scopeType && s.value === scopeValue);
</script>

<div class="flex flex-col gap-3 w-full max-w-lg mx-auto">
    <!-- Quick Scope Chips -->
    {#if quickScopes.length > 0}
        <div class="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-1">
            <span class="text-[10px] uppercase font-bold text-gray-400 shrink-0 mr-1"><i class="bi bi-star-fill text-warning"></i> Quick:</span>
            {#each quickScopes as qs}
                <button type="button" class="badge badge-sm py-3 px-3 cursor-pointer shrink-0 transition-all font-medium {scopeType === qs.type && scopeValue === qs.value ? 'badge-primary shadow-sm scale-105' : 'badge-ghost hover:badge-neutral'}" on:click={() => selectScope(qs.type, qs.value)}>
                    {qs.label}
                </button>
            {/each}
        </div>
    {/if}

    <!-- Scope Type Selector -->
    <div class="bg-base-200/70 p-1 rounded-2xl flex items-center gap-1 border border-base-200">
        <button type="button" class="btn btn-xs flex-1 rounded-xl border-none transition-all {scopeType === 'all' ? 'bg-base-100 shadow-sm text-base-content font-bold' : 'btn-ghost text-gray-500'}" on:click={() => selectScope('all')}>
            Everything
        </button>
        <button type="button" class="btn btn-xs flex-1 rounded-xl border-none transition-all {scopeType === 'tag' ? 'bg-base-100 shadow-sm text-base-content font-bold' : 'btn-ghost text-gray-500'}" on:click={() => selectScope('tag', customInput || 'books')}>
            By Tag
        </button>
        <button type="button" class="btn btn-xs flex-1 rounded-xl border-none transition-all {scopeType === 'container' ? 'bg-base-100 shadow-sm text-base-content font-bold' : 'btn-ghost text-gray-500'}" on:click={() => selectScope('container', containers[0]?.name || '')}>
            By Location
        </button>
    </div>

    <!-- Scope Input Details -->
    {#if scopeType === 'tag'}
        <div class="flex items-center gap-2 animate-fade-in">
            <div class="input input-sm input-bordered rounded-xl flex items-center gap-2 flex-1 bg-base-100 shadow-inner">
                <span class="text-primary font-bold">#</span>
                <input type="text" bind:value={customInput} placeholder="e.g. canned-veggie, ps2-games" class="grow bg-transparent border-none focus:outline-none text-xs" on:input={() => selectScope('tag', customInput)} />
            </div>
            <button type="button" class="btn btn-sm btn-circle btn-ghost {isCurrentScopeSaved ? 'text-warning' : 'text-gray-400 hover:text-warning'}" title={isCurrentScopeSaved ? 'Remove from Quick Scopes' : 'Star as Quick Scope'} on:click={toggleSaveQuickScope}>
                <i class="bi bi-star{isCurrentScopeSaved ? '-fill' : ''}"></i>
            </button>
        </div>
    {:else if scopeType === 'container'}
        <div class="flex items-center gap-2 animate-fade-in">
            <select class="select select-sm select-bordered rounded-xl flex-1 bg-base-100 text-xs shadow-inner" bind:value={scopeValue} on:change={() => selectScope('container', scopeValue)}>
                {#each containers as c}
                    <option value={c.name}>{c.name} {c.description ? `(${c.description})` : ''}</option>
                {/each}
            </select>
            <button type="button" class="btn btn-sm btn-circle btn-ghost {isCurrentScopeSaved ? 'text-warning' : 'text-gray-400 hover:text-warning'}" title={isCurrentScopeSaved ? 'Remove from Quick Scopes' : 'Star as Quick Scope'} on:click={toggleSaveQuickScope}>
                <i class="bi bi-star{isCurrentScopeSaved ? '-fill' : ''}"></i>
            </button>
        </div>
    {/if}
</div>