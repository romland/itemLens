<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import InteractiveColorMix from '../InteractiveColorMix.svelte';
    const dispatch = createEventDispatcher();

    export let item: any = null;
    export let activeSchema: any[] = [];
    export let showAll: boolean = false;
    
    let localAttributes: Record<string, string> = {};
    let customInputs: Record<string, boolean> = {};

    // Reactively determine which fields require human intervention
    $: if (item) {
        const raw = { ...(item.extractedAttributes || {}) };
        for (const k in raw) {
            if (typeof raw[k] === 'object' && raw[k] !== null) raw[k] = JSON.stringify(raw[k]);
        }
        localAttributes = raw;
    }

    $: requiredFields = showAll ? activeSchema : activeSchema.filter(f => 
        f.extractionMethod === 'HUMAN_REQUIRED' || 
        (f.extractionMethod === 'HYBRID' && !localAttributes[f.name])
    );

    function setEnum(name: string, value: string) {
        localAttributes[name] = value;
    }

    function save() {
        dispatch('save', { item, attributes: localAttributes });
    }

    function formatEnumLabel(str: string) {
        return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function getProcessedOptions(options: string[] | null) {
        if (!options) return [];
        
        const getSortedTokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
        const unique = [];
        const seenTokens = new Set();
        for (const opt of options) {
            const tokens = getSortedTokens(opt);
            if (!seenTokens.has(tokens)) {
                seenTokens.add(tokens);
                unique.push(opt);
            }
        }
        return unique.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    }

    function isFreetextLike(options: string[] | null) {
        if (!options || options.length === 0) return false;
        
        // Absolute sanity limit for UI real estate
        if (options.length > 40) return true;

        let totalWords = 0;
        let totalLength = 0;
        let phraseCount = 0; // Tracks items with 3+ words

        for (const opt of options) {
            totalLength += opt.length;
            // Split by space, underscore, or dash to count actual words
            const wordCount = opt.split(/[\s_-]+/).filter(w => w.trim().length > 0).length;
            totalWords += wordCount;
            if (wordCount >= 3) phraseCount++;
        }

        const avgLength = totalLength / options.length;
        const avgWords = totalWords / options.length;

        // Triggers for free-text masquerading as enums
        if (options.length > 3 && (phraseCount / options.length) > 0.3) return true;
        if (avgWords >= 2.5) return true;
        if (avgLength > 18) return true;

        return false;
    }

    function getPlaceholder(fieldName: string) {
        switch(fieldName) {
            case 'distinctive_blemishes_or_wear': return 'Leave empty if pristine...';
            case 'brand_or_creator': return 'Leave empty if unknown...';
            case 'prominent_text_or_graphic': return 'Leave empty if no print...';
            default: return 'Enter value...';
        }
    }
</script>

<div class="p-6 bg-base-100 flex flex-col gap-5">
    <div>
        <h3 class="font-bold text-xl leading-tight">Attributes</h3>
        <p class="text-xs text-gray-500 mt-1">Details for "{item?.title}"</p>
    </div>

    <div class="flex flex-col gap-4 overflow-y-auto max-h-[50vh] pr-2">
        {#each requiredFields as field}
            <div class="form-control w-full">
                <label class="label pb-1"><span class="label-text font-semibold">{field.uiLabel}</span></label>
                
                {#if field.type === 'enum' && field.options}
                {@const processedOptions = getProcessedOptions(field.options)}
                {@const isFreetext = isFreetextLike(processedOptions)}
                
                {#if isFreetext}
                    <input list="datalist-{field.name}" bind:value={localAttributes[field.name]} placeholder={getPlaceholder(field.name)} class="input input-bordered w-full rounded-xl bg-base-50" />
                    <datalist id="datalist-{field.name}">
                        {#each processedOptions as opt}
                            <option value={opt}>{formatEnumLabel(opt)}</option>
                        {/each}
                    </datalist>
                {:else}
                    <div class="flex flex-wrap gap-2 mt-1">
                        {#each processedOptions as opt}
                            <button 
                                type="button" 
                                class="badge badge-lg py-4 px-4 hover:border-primary transition-all capitalize {localAttributes[field.name] === opt ? 'badge-primary shadow-md' : 'badge-ghost border-base-300'}"
                                on:click={() => setEnum(field.name, opt)}>
                                {formatEnumLabel(opt)}
                            </button>
                        {/each}
                        {#if localAttributes[field.name] && !processedOptions.includes(localAttributes[field.name])}
                            <button type="button" class="badge badge-lg badge-primary py-4 px-4 shadow-md transition-all capitalize" on:click={() => setEnum(field.name, '')}>
                                {formatEnumLabel(localAttributes[field.name])} <i class="bi bi-x ml-1"></i>
                            </button>
                        {/if}

                        {#if customInputs[field.name]}
                            <input type="text" placeholder="Add new..." class="input input-bordered input-sm rounded-lg w-28" 
                                on:keydown={(e) => { if(e.key === 'Enter') { setEnum(field.name, e.currentTarget.value); customInputs[field.name] = false; } }} 
                                on:blur={(e) => { if(e.currentTarget.value) setEnum(field.name, e.currentTarget.value); customInputs[field.name] = false; }} autofocus />
                        {:else}
                            <button type="button" class="badge badge-lg badge-outline border-dashed hover:border-primary py-4 px-4 transition-all text-gray-500" on:click={() => customInputs[field.name] = true}>+ Custom</button>
                        {/if}
                    </div>
                {/if}
                {:else if field.type === 'number'}
                    <input type="number" bind:value={localAttributes[field.name]} placeholder="0" class="input input-bordered w-full rounded-xl bg-base-50" />
                {:else if field.name === 'color_mix'}
                    <InteractiveColorMix initialMixStr={item?.extractedAttributes?.color_mix || item?.color_mix || '[]'} bind:valueStr={localAttributes[field.name]} />
                {:else}
                <input type="text" bind:value={localAttributes[field.name]} placeholder={getPlaceholder(field.name)} class="input input-bordered w-full rounded-xl bg-base-50" />
                {/if}
            </div>
        {/each}
    </div>

    <div class="pt-2 border-t border-base-200 flex gap-2">
        <button class="btn btn-ghost flex-1 rounded-xl" on:click={() => dispatch('cancel')}>Skip</button>
        <button class="btn btn-primary flex-1 rounded-xl shadow-md" on:click={save}>Save Item</button>
    </div>
</div>