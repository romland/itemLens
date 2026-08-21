<script lang="ts">
    import { enhance } from "$app/forms";
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();
    let modal: HTMLDialogElement;
    export function showModal() { modal.showModal(); }

    let name = '';
    let contentsHint = '';

    // =============================================================================
    // [ARCHETYPE DEFAULTS CONFIGURATION - UI NOTE]
    // When creating an inventory, the archetype determines intelligent system defaults.
    // For example:
    // - Apparel needs deep scanning (parsing huge piles of clothes) and AI taxonomy.
    // - Media/Books needs deep scanning but NOT background removal (boxes/covers are flat).
    //
    // If you add new archetypes or tweak defaults below, ensure they are mirrored in:
    // 1. Backend creation (src/routes/settings/+page.server.ts -> createInventory)
    // 2. The LLM prompts (src/lib/server/ontology.ts)
    // =============================================================================
    let selectedArchetype = 'hardware';

    // Defines the UI representation of the archetypes and their backend defaults
    const archetypes = [
        { 
            id: 'hardware', name: 'Hardware & Equipment', icon: 'bi-tools', 
            examples: 'Cameras, instruments, sports, electronics, tools, laptops, etc.', 
            defaults: [{label: 'AI Taxonomy', icon: 'bi-diagram-3', highlight: true}] 
        },
        { 
            id: 'apparel', name: 'Apparel & Soft Goods', icon: 'bi-handbag', 
            examples: 'Clothes, shoes, scarves, belts, bags, textiles, etc.', 
            defaults: [{label: 'AI Taxonomy', icon: 'bi-diagram-3', highlight: true}, {label: 'Deep Scan', icon: 'bi-search', highlight: true}] 
        },
        { 
            id: 'media', name: 'Media & Publications', icon: 'bi-book', 
            examples: 'Books, comics, CDs, DVDs, vinyls, games, etc.', 
            defaults: [{label: 'Deep Scan', icon: 'bi-search', highlight: true}, {label: 'No BG Removal', icon: 'bi-image-fill', highlight: false}] 
        },
        { 
            id: 'consumables', name: 'Consumables & Pantry', icon: 'bi-basket', 
            examples: 'Whiskys, wines, groceries, canned veggies, spices, etc', 
            defaults: [{label: 'Standard', icon: 'bi-gear', highlight: false}] 
        },
        { 
            id: 'collectibles', name: 'Valuables/Collectibles', icon: 'bi-gem', 
            examples: 'Coins, stamps, cards, sculptures, toys, Lego, posters, pet rocks, etc.', 
            defaults: [{label: 'AI Taxonomy', icon: 'bi-diagram-3', highlight: true}, {label: 'Deep Scan', icon: 'bi-search', highlight: true}] 
        },
        { 
            id: 'natural', name: 'Natural Specimens', icon: 'bi-tree', 
            examples: 'Plants, rocks, crystals, seashells, fossils, etc.', 
            defaults: [{label: 'AI Taxonomy', icon: 'bi-diagram-3', highlight: true}] 
        },
        { 
            id: 'generic', name: 'Generic / Mixed', icon: 'bi-box-seam', 
            examples: 'A mix of various unrelated items.', 
            defaults: [{label: 'Standard', icon: 'bi-gear', highlight: false}] 
        }
    ];

    function handleEnhance() {
        return async ({ result, update }: any) => {
            if (result.type === 'success' || result.type === 'redirect') {
                dispatch('success', result.data?.message || 'Inventory created successfully!');
                modal.close();
                name = '';
                contentsHint = '';
                selectedArchetype = 'hardware';
            } else {
                dispatch('error', result.data?.message || 'An error occurred while creating inventory.');
            }
            await update({ reset: false });
        };
    }
</script>

<dialog bind:this={modal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box p-0 overflow-hidden bg-base-100 shadow-2xl border border-base-200 sm:rounded-[2.5rem] max-w-4xl flex flex-col max-h-[90vh]">
        <div class="p-6 pb-4 border-b border-base-200 bg-base-100/90 sticky top-0 z-10 flex justify-between items-center">
            <div>
                <h3 class="font-bold text-xl leading-tight">Create New Inventory</h3>
                <p class="text-xs text-gray-500 mt-1">Select an archetype to automatically configure optimal system defaults.</p>
            </div>
            <button type="button" class="btn btn-sm btn-circle btn-ghost" on:click={() => modal.close()}><i class="bi bi-x-lg"></i></button>
        </div>

        <form method="POST" action="?/createInventory" use:enhance={handleEnhance} class="flex flex-col overflow-hidden">
            <div class="p-4 sm:p-6 overflow-y-auto flex flex-col gap-6 bg-base-50">
                <div class="form-control w-full">
                    <label class="label"><span class="label-text font-semibold text-lg">Name your inventory</span></label>
                    <input type="text" name="name" bind:value={name} placeholder="e.g., Garage Workbench, Wine Cellar..." class="input input-bordered input-lg w-full rounded-2xl shadow-inner focus:border-primary" required autocomplete="off">
                </div>

                <div class="form-control w-full -mt-2">
                    <label class="label"><span class="label-text font-semibold text-lg">What will be in it? (1-3 words)</span></label>
                    <!-- This hint empowers the LLM to generate a bespoke schema even if the archetype is broad -->
                    <input type="text" name="contentsHint" bind:value={contentsHint} placeholder="e.g. vintage stamps, lego, cables..." class="input input-bordered w-full rounded-2xl shadow-inner focus:border-primary" required>
                </div>

                <div>
                    <label class="label"><span class="label-text font-semibold text-lg">Select Archetype</span></label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                        {#each archetypes as type}
                            <label class="cursor-pointer relative">
                                <input type="radio" name="archetype" value={type.id} bind:group={selectedArchetype} class="peer sr-only" />
                                <div class="card bg-base-100 border-2 transition-all duration-200 h-full p-4 peer-checked:border-primary peer-checked:shadow-[0_0_15px_rgba(var(--p),0.2)] peer-checked:bg-primary/5 border-base-200 hover:border-primary/50">
                                    <div class="absolute top-4 right-4 text-primary opacity-0 peer-checked:opacity-100 transition-opacity"><i class="bi bi-check-circle-fill text-xl"></i></div>
                                    <div class="flex items-start gap-3 h-full">
                                        <div class="w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center text-xl shrink-0 text-base-content peer-checked:bg-primary peer-checked:text-primary-content transition-colors"><i class="bi {type.icon}"></i></div>
                                        <div class="flex flex-col flex-1 min-w-0 pr-6 h-full">
                                            <span class="font-bold text-lg leading-tight mb-1">{type.name}</span>
                                            <span class="text-xs text-gray-500 leading-snug mb-3">{type.examples}</span>
                                            <div class="mt-auto pt-3 border-t border-base-200/60 flex flex-wrap gap-1.5 w-full min-w-0">
                                                {#each type.defaults as def}
                                                    <span class="badge badge-sm badge-ghost text-[10px] font-bold uppercase tracking-wider max-w-full transition-colors {def.highlight ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20' : 'opacity-70 hover:opacity-100 hover:bg-base-200'}" title="{def.label}">
                                                        <i class="bi {def.icon} mr-1 shrink-0"></i> 
                                                        <span class="truncate">{def.label}</span>
                                                    </span>
                                                {/each}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </label>
                        {/each}
                    </div>
                </div>
            </div>
            <div class="p-4 bg-base-100 border-t border-base-200 sticky bottom-0 z-10">
                <button type="submit" class="btn btn-primary btn-lg w-full rounded-2xl shadow-lg" disabled={!name.trim()}>Create "{name.trim() || 'Inventory'}"</button>
            </div>
        </form>
    </div>
    <form method="dialog" class="modal-backdrop"><button type="button" on:click={() => modal.close()}>close</button></form>
</dialog>