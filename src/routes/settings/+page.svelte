<script lang="ts">
    import type { ActionData } from "./$types";
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";
    import { onMount } from "svelte";
    import Alert from "$lib/components/alert.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    export let form: ActionData;

    const updateTheme: SubmitFunction = ({ action }) => {
        const theme = action.searchParams.get('theme');

        if (theme) {
            document.documentElement.setAttribute('data-theme', theme);
        }

        return async ({ result, update }) => {
            // Intercept the server redirect to force a replaceState instead of a history push
            if (result.type === 'redirect') {
                await goto(result.location, { replaceState: true, invalidateAll: true });
            } else {
                await update();
            }
        };        
    }

    const themes = [
        { id: 'rehoboam', name: 'Westworld', icon: 'bi-record-circle' },
        { id: 'matrix', name: 'The Matrix', icon: 'bi-code-square' },
        { id: 'abyss', name: 'Abyss (Blue)', icon: 'bi-water' },
        { id: 'nebula', name: 'Nebula (Purple)', icon: 'bi-stars' },
        { id: 'forge', name: 'Forge (Ember)', icon: 'bi-fire' },
        { id: 'black', name: 'OLED Black', icon: 'bi-circle-fill' },
        { id: 'cyberpunk', name: 'Cyberpunk', icon: 'bi-lightning-charge' },
        { id: 'synthwave', name: 'Synthwave', icon: 'bi-grid-3x3-gap' },
        { id: 'dracula', name: 'Dracula', icon: 'bi-droplet' },
        { id: 'luxury', name: 'Luxury', icon: 'bi-gem' },
        { id: 'coffee', name: 'Coffee', icon: 'bi-cup-hot' },
        { id: 'dark', name: 'Default Dark', icon: 'bi-moon' },
        { id: 'light', name: 'Default Light', icon: 'bi-sun' }
    ];

    import pageTitle from '$lib/stores';
    pageTitle.set("Settings");

    let currentTheme = "";
    onMount(() => {
        currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const observer = new MutationObserver(() => {
            currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        
        return () => observer.disconnect();
    });

    let deleteConfirmId: number | null = null;
    let deleteConfirmText: string = "";
    let editUserId: number | null = null;

</script>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

<div class="max-w-2xl mx-auto">
    <h2 class="text-2xl font-bold mb-6">Appearance</h2>
    
    <div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6 mb-8">
        <h3 class="font-bold text-lg mb-4">Application Theme</h3>
        <p class="text-sm text-gray-500 mb-6">Select a theme to change the colors and feel of the entire application.</p>
        
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {#each themes as theme}
                <form method="POST" action="/?/setTheme&theme={theme.id}&redirectTo=/settings" use:enhance={() => {
                    // Instantly apply the theme in the browser while the server saves the cookie
                    document.documentElement.setAttribute('data-theme', theme.id);
                    return async ({ update }) => {
                        await update({ reset: false });
                    };
                }}>
                    <button type="submit" class="btn h-auto py-4 w-full flex flex-col items-center gap-2 rounded-xl border transition-all {currentTheme === theme.id ? 'border-primary ring-2 ring-primary/30 bg-base-300' : 'border-base-300 hover:border-primary/50 bg-base-200 hover:bg-base-300'}">
                        <i class="bi {theme.icon} text-2xl"></i>
                        <span class="font-semibold text-sm">{theme.name}</span>
                    </button>
                </form>
            {/each}
        </div>
    </div>

    <div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6 mb-8">
        <h3 class="font-bold text-lg mb-4">Create New Vault</h3>
        <form method="POST" action="?/createVault" use:enhance class="flex gap-2">
            <input type="text" name="name" placeholder="Vault Name (e.g., Books)" class="input input-bordered w-full" required>
            <button type="submit" class="btn btn-primary">Create</button>
        </form>
    </div>

    {#if $page.data.user?.isAdmin}
        <div class="bg-base-100 border border-error/20 shadow-sm rounded-xl p-6 mb-8 relative overflow-hidden">
            <div class="absolute top-0 right-0 bg-error text-error-content text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Admin Only</div>
<!--
            <h3 class="font-bold text-lg mb-4">Create New Vault</h3>
            <form method="POST" action="?/createVault" use:enhance class="flex gap-2 mb-8">
                <input type="text" name="name" placeholder="Vault Name (e.g., Books)" class="input input-bordered w-full" required>
                <button type="submit" class="btn btn-primary">Create</button>
            </form>
-->
            <h3 class="font-bold text-lg mb-4 text-error"><i class="bi bi-shield-lock"></i> Add User</h3>
            <form method="POST" action="?/createUser" use:enhance class="flex flex-col sm:flex-row gap-2">
                <input type="text" name="username" placeholder="Username" class="input input-bordered w-full" required autocomplete="off">
                <input type="password" name="password" placeholder="Password" class="input input-bordered w-full" required autocomplete="new-password">
                <button type="submit" class="btn btn-error text-white">Create User</button>
            </form>

            <div class="divider my-6">Manage Users</div>

            <div class="overflow-x-auto bg-base-200 rounded-lg mb-8">
                <table class="table table-sm">
                    <thead><tr><th>Username</th><th>Name</th><th>Role</th><th></th></tr></thead>
                    <tbody>
                        {#each $page.data.allUsers || [] as u}
                            {#if editUserId === u.id}
                                <tr>
                                    <td colspan="4" class="p-4 bg-base-300">
                                        <form method="POST" action="?/updateUser" use:enhance={() => { return async ({ update }) => { editUserId = null; update(); }; }} class="flex flex-col gap-3">
                                            <input type="hidden" name="id" value={u.id}>
                                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div class="form-control">
                                                    <label class="label"><span class="label-text">Name</span></label>
                                                    <input type="text" name="name" value={u.name || ''} class="input input-sm input-bordered" />
                                                </div>
                                                <div class="form-control">
                                                    <label class="label"><span class="label-text">Email</span></label>
                                                    <input type="email" name="email" value={u.email || ''} class="input input-sm input-bordered" />
                                                </div>
                                                <div class="form-control">
                                                    <label class="label"><span class="label-text">New Password (leave blank to keep)</span></label>
                                                    <input type="password" name="password" class="input input-sm input-bordered" placeholder="******" />
                                                </div>
                                                <div class="form-control justify-end pb-1">
                                                    <label class="label cursor-pointer justify-start gap-3 w-fit">
                                                        <input type="checkbox" name="isAdmin" value="true" checked={u.isAdmin} class="checkbox checkbox-sm checkbox-error" />
                                                        <span class="label-text font-bold text-error">System Admin</span>
                                                    </label>
                                                </div>
                                            </div>
                                            <div class="flex gap-2 justify-end mt-2">
                                                <button type="button" class="btn btn-sm btn-ghost" on:click={() => editUserId = null}>Cancel</button>
                                                <button type="submit" class="btn btn-sm btn-primary">Save Changes</button>
                                            </div>
                                        </form>
                                    </td>
                                </tr>
                            {:else}
                                <tr>
                                    <td><span class="font-bold">{u.username}</span></td>
                                    <td>{u.name || '-'}</td>
                                    <td>
                                        {#if u.isAdmin}<span class="badge badge-error badge-sm text-white">Admin</span>{:else}<span class="badge badge-ghost badge-sm">User</span>{/if}
                                    </td>
                                    <td class="text-right">
                                        <button type="button" class="btn btn-ghost btn-xs" on:click={() => editUserId = u.id}><i class="bi bi-pencil"></i> Edit</button>
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                    </tbody>
                </table>
            </div>

            <div class="divider my-6">Vault Access</div>

            <form method="POST" action="?/assignAccess" use:enhance class="flex flex-col sm:flex-row gap-2 mb-6">
                <select name="userId" class="select select-bordered w-full" required>
                    <option value="" disabled selected>Select User</option>
                    {#each $page.data.allUsers || [] as u}
                        <option value={u.id}>{u.username} ({u.name})</option>
                    {/each}
                </select>
                <select name="inventoryId" class="select select-bordered w-full" required>
                    <option value="" disabled selected>Select Vault</option>
                    {#each $page.data.allVaults || [] as v}
                        <option value={v.id}>{v.name}</option>
                    {/each}
                </select>
                <select name="role" class="select select-bordered w-full sm:w-auto" required>
                    <option value="OWNER">Owner</option>
                    <option value="EDITOR" selected>Editor</option>
                    <option value="VIEWER">Viewer</option>
                </select>
                <button type="submit" class="btn btn-neutral">Assign</button>
            </form>

            <div class="overflow-x-auto bg-base-200 rounded-lg">
                <table class="table table-sm">
                    <thead><tr><th>User</th><th>Vault</th><th>Role</th><th></th></tr></thead>
                    <tbody>
                        {#each $page.data.accessMap || [] as access}
                            <tr>
                                <td>{access.user.username}</td>
                                <td>{access.inventory.name}</td>
                                <td><span class="badge badge-sm">{access.role}</span></td>
                                <td class="text-right">
                                    <form method="POST" action="?/revokeAccess" use:enhance>
                                        <input type="hidden" name="userId" value={access.userId}>
                                        <input type="hidden" name="inventoryId" value={access.inventoryId}>
                                        <button type="submit" class="btn btn-ghost btn-xs text-error"><i class="bi bi-trash"></i></button>
                                    </form>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <div class="divider my-6">Manage Vaults</div>

            <div class="overflow-x-auto bg-base-200 rounded-lg">
                <table class="table table-sm">
                    <thead><tr><th>Vault Name</th><th></th></tr></thead>
                    <tbody>
                        {#each $page.data.allVaults || [] as v}
                            <tr>
                                <td>
                                    <div class="font-bold {deleteConfirmId === v.id ? 'text-error' : ''}">{v.name}</div>
                                    <div class="text-[10px] text-gray-500 mt-0.5">{v._count?.items || 0} items &bull; {v._count?.notes || 0} notes &bull; {v._count?.containers || 0} containers</div>
                                    {#if deleteConfirmId === v.id}
                                        <div class="text-[10px] text-error mt-0.5">Type <strong>{v.name}</strong> to confirm</div>
                                    {/if}
                                </td>
                                <td class="text-right">
                                    {#if deleteConfirmId === v.id}
                                        <form method="POST" action="?/deleteVault" use:enhance={() => { return async ({ update }) => { deleteConfirmId = null; deleteConfirmText = ''; update(); }; }} class="flex items-center gap-2 justify-end">
                                            <input type="hidden" name="id" value={v.id}>
                                            <input type="text" name="confirmName" bind:value={deleteConfirmText} class="input input-xs input-bordered border-error focus:border-error w-32 bg-base-100" placeholder="Type name..." autocomplete="off">
                                            <button type="submit" class="btn btn-error btn-xs" disabled={deleteConfirmText !== v.name}>Delete</button>
                                            <button type="button" class="btn btn-ghost btn-xs" on:click={() => {deleteConfirmId = null; deleteConfirmText = '';}}>Cancel</button>
                                        </form>
                                    {:else}
                                        <button type="button" class="btn btn-ghost btn-xs text-error" on:click={() => {deleteConfirmId = v.id; deleteConfirmText = '';}}>
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

        </div>
    {/if}
</div>
