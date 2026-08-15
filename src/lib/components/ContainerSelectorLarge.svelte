<script>
    import { createEventDispatcher } from 'svelte';
    
    const dispatch = createEventDispatcher();
    export let containers = [];

    let newContainerName = "";
    let isCreating = false;

    async function createContainer() {
        if (!newContainerName.trim()) return;
        isCreating = true;
        try {
            const res = await fetch('/api/containers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newContainerName })
            });
            if (res.ok) {
                const newC = await res.json();
                newC.children = []; // Ensure children array exists for the template
                containers = [newC, ...containers];
                newContainerName = "";
                dispatch('success', `Created location: ${newC.name}`);
            } else {
                dispatch('error', 'Failed to create location.');
            }
        } finally {
            isCreating = false;
        }
    }
</script>

<div class="flex items-center gap-2 mb-4 bg-base-200/50 p-2 rounded-xl border border-base-200">
    <input type="text" placeholder="Quick create new container..." class="input input-sm border-none shadow-inner bg-base-100 w-full max-w-xs" bind:value={newContainerName} on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), createContainer())} />
    <button type="button" class="btn btn-sm btn-primary shadow-sm" disabled={isCreating || !newContainerName.trim()} on:click={createContainer}>
        {#if isCreating}
            <span class="loading loading-spinner loading-xs"></span>
        {:else}
            <i class="bi bi-plus-lg"></i> Create
        {/if}
    </button>
</div>

    <table class="table">
        <tbody>
            {#each containers as container}
                <tr>
                    <th>
                        <label>
                            <input name="locations" value="1" type="checkbox" class="checkbox" />
                        </label>
                    </th>
                    <td>
                        <div class="flex items-center gap-3">
                            <div class="avatar">
                                <div class="mask mask-square w-12 h-12">
                                    <img src="{container.photoPath}" alt="Container" class="hover:scale-125 transition duration-500 cursor-pointer"/>
                                </div>
                            </div>
                            <div>
                                <div class="font-bold">{container.name}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        {#if container.children.length > 0}
                            <select class="select select-bordered w-full max-w-xs" multiple>
                                <option disabled selected>Tray</option>
                                {#each container.children as child}
                                    <option>{child.name}</option>
                                {/each}
                            </select>
                        {/if}
                    </td>
                    <th>
                        <div>
                            {container.location}<br/>
                        </div>
                    </th>
                    <th>
                        <div>
                            {container.description}<br/>
                        </div>
                    </th>
                </tr>
            {/each}
        </tbody>
    </table>
