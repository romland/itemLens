<script lang="ts">
    import type { ActionData } from "./$types";
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";
    import { onMount } from "svelte";
    import Alert from "$lib/components/alert.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
	import Notifications from "$lib/components/Notifications.svelte";
    import CreateInventoryModal from "$lib/components/CreateInventoryModal.svelte";
	import { nukeAllCaches } from "$lib/client/utils";

    export let form: ActionData;

	let notifications: any[] = [];
	let avatarPreview: string | null = null;
    let createInventoryModal: CreateInventoryModal;

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
        { id: 'light', name: 'Default Light', icon: 'bi-sun' },
        { id: 'manhattan', name: 'Manhattan', icon: 'bi-building' }
    ];


	function notify(status: string, message: string, id: string | null = null) {
		const newId = id || Math.random().toString(36);
		notifications = [...notifications, { id: newId, status, message }];
		if (status !== 'loading') setTimeout(() => { notifications = notifications.filter(n => n.id !== newId); }, 3000);
		return newId;
	}

	function createEnhancer() {
		return async ({ result, update }: any) => {
			if (result.type === 'success' || result.type === 'redirect') {
				notify('success', result.data?.message || 'Saved successfully');
				if (result.data?.message?.includes('Profile')) avatarPreview = null; // drop preview to show real avatar
			} else if (result.type === 'failure' || result.type === 'error') {
				notify('error', result.data?.message || 'An error occurred');
			}
			await update({ reset: false });
		};
	}

	function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			avatarPreview = URL.createObjectURL(target.files[0]);
		}
	}


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

<Notifications bind:notifications />

<div class="max-w-2xl mx-auto">

	<div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6 mb-8">
		<h3 class="font-bold text-lg mb-4">Device Management</h3>
		<button type="button" class="btn btn-outline border-base-300 hover:border-error hover:bg-error/10 hover:text-error flex items-center justify-between w-full h-auto py-4 rounded-xl" on:click={nukeAllCaches}>
			<div class="flex items-center gap-3">
				<i class="bi bi-trash3-fill text-xl text-error"></i>
				<div class="text-left flex flex-col">
					<span class="font-bold">Clear Offline Cache</span>
					<span class="text-xs opacity-70 font-normal mt-0.5">Free up space and force a hard resync on this device.</span>
				</div>
			</div>
			<i class="bi bi-arrow-clockwise opacity-50"></i>
		</button>
	</div>

	<!-- APPEARANCE -->
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

	<!-- PROFILE -->
	<h2 class="text-2xl font-bold mb-6">Profile & Security</h2>
	<div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6 mb-8">
		<form method="POST" action="?/updateProfile" enctype="multipart/form-data" class="flex flex-col gap-5" use:enhance={createEnhancer}>
			<div class="flex items-center gap-6 mb-2">
				<div class="avatar relative group cursor-pointer" on:click={() => document.getElementById('avatarUpload')?.click()}>
					<div class="w-20 rounded-full border-4 border-base-100 shadow-md bg-base-200">
						{#if avatarPreview}
							<img src={avatarPreview} alt="Preview" class="object-cover" />
						{:else if $page.data.user?.avatar}
							<img src={$page.data.user.avatar} alt="Current avatar" class="object-cover" />
						{:else}
							<div class="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-400">
								{$page.data.user?.name ? $page.data.user.name.charAt(0).toUpperCase() : '?'}
							</div>
						{/if}
					</div>
					<div class="absolute bottom-0 right-0 bg-primary text-white rounded-full w-7 h-7 flex items-center justify-center shadow-sm border-2 border-base-100">
						<i class="bi bi-camera-fill text-xs"></i>
					</div>
				</div>
				<input type="file" id="avatarUpload" name="avatar" accept="image/*" class="hidden" on:change={handleFileChange} />
				<div class="text-sm text-gray-500">Tap to upload a new profile picture.</div>
			</div>
			<div class="form-control w-full">
				<label class="label"><span class="label-text font-semibold">Display Name</span></label>
				<input type="text" name="name" value={$page.data.user?.name || ''} class="input input-bordered w-full" />
			</div>
			<div class="form-control w-full">
				<label class="label"><span class="label-text font-semibold">Email Address</span></label>
				<input type="email" name="email" value={$page.data.user?.email || ''} class="input input-bordered w-full" />
			</div>
			<button type="submit" class="btn btn-primary mt-2">Save Profile</button>
		</form>
		
		<div class="divider my-6">Password</div>
		<form method="POST" action="?/updatePassword" use:enhance={createEnhancer} class="flex flex-col gap-4">
			<div class="flex flex-col sm:flex-row gap-2">
				<input type="password" name="password" placeholder="New Password" class="input input-bordered w-full">
				<button type="submit" class="btn btn-neutral sm:w-auto">Update Password</button>
			</div>
		</form>
	</div>


	<div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6 mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
		<div>
			<h3 class="font-bold text-lg mb-1">Create New Inventory</h3>
			<p class="text-sm text-gray-500">Set up a new isolated vault for a specific collection of items.</p>
		</div>
		<button type="button" class="btn btn-primary shadow-sm shrink-0 w-full sm:w-auto" on:click={() => createInventoryModal.showModal()}>
			<i class="bi bi-plus-lg"></i> Create Inventory
		</button>
	</div>

    {#if $page.data.user?.isAdmin}
        <div class="bg-base-100 border border-error/20 shadow-sm rounded-xl p-6 mb-8 relative overflow-hidden">
            <div class="absolute top-0 right-0 bg-error text-error-content text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Admin Only</div>

            <h3 class="font-bold text-lg mb-4 text-error"><i class="bi bi-shield-lock"></i> Add User</h3>
			<form method="POST" action="?/createUser" use:enhance={createEnhancer} class="flex flex-col sm:flex-row gap-2">
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
										<form method="POST" action="?/updateUser" use:enhance={() => { return async ({ result, update }) => { if (result.type === 'success') { notify('success', 'User updated'); editUserId = null; } else { notify('error', result.data?.message || 'Error'); } update(); }; }} class="flex flex-col gap-3">
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

			<div class="divider my-6">Inventory Access</div>

			<form method="POST" action="?/assignAccess" use:enhance={createEnhancer} class="flex flex-col sm:flex-row gap-2 mb-6">
                <select name="userId" class="select select-bordered w-full" required>
                    <option value="" disabled selected>Select User</option>
                    {#each $page.data.allUsers || [] as u}
                        <option value={u.id}>{u.username} ({u.name})</option>
                    {/each}
                </select>
                <select name="inventoryId" class="select select-bordered w-full" required>
					<option value="" disabled selected>Select Inventory</option>
					{#each $page.data.allInventories || [] as v}
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
					<thead><tr><th>User</th><th>Inventory</th><th>Role</th><th></th></tr></thead>
                    <tbody>
                        {#each $page.data.accessMap || [] as access}
                            <tr>
                                <td>{access.user.username}</td>
                                <td>{access.inventory.name}</td>
                                <td><span class="badge badge-sm">{access.role}</span></td>
                                <td class="text-right">
									<form method="POST" action="?/revokeAccess" use:enhance={createEnhancer}>
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

			<div class="divider my-6">Manage Inventories</div>

            <div class="overflow-x-auto bg-base-200 rounded-lg">
                <table class="table table-sm">
					<thead><tr><th>Inventory Name</th><th></th></tr></thead>
                    <tbody>
						{#each $page.data.allInventories || [] as v}
                            <tr>
                                <td>
                                    <div class="font-bold {deleteConfirmId === v.id ? 'text-error' : ''}">{v.name}</div>
                                    <div class="text-[10px] text-gray-500 mt-0.5">{v._count?.items || 0} items &bull; {v._count?.notes || 0} notes &bull; {v._count?.containers || 0} containers</div>
                                    {#if deleteConfirmId === v.id}
                                        <div class="text-[10px] text-error mt-0.5">Type <strong>{v.name}</strong> to confirm</div>
                                    {/if}
									<form method="POST" action="?/toggleAutoCategories" use:enhance={createEnhancer} class="mt-2 flex items-center gap-2">
										<input type="hidden" name="id" value={v.id}>
										<input type="hidden" name="allowNewCategories" value={(!v.allowNewCategories).toString()}>
										<input type="checkbox" class="toggle toggle-xs toggle-primary" checked={v.allowNewCategories} on:change={(e) => e.currentTarget.form?.requestSubmit()} />
										<span class="text-xs text-gray-500 font-medium">Allow automated creation of categories</span>
									</form>
									<form method="POST" action="?/toggleAutoTaxonomy" use:enhance={createEnhancer} class="mt-2 flex items-center gap-2">
										<input type="hidden" name="id" value={v.id}>
										<input type="hidden" name="allowAutoTaxonomy" value={(!v.allowAutoTaxonomy).toString()}>
										<input type="checkbox" class="toggle toggle-xs toggle-primary" checked={v.allowAutoTaxonomy} on:change={(e) => e.currentTarget.form?.requestSubmit()} />
										<span class="text-xs text-gray-500 font-medium">Enable AI Taxonomy & Attribute Extractions</span>
									</form>
									<form method="POST" action="?/toggleExtractExif" use:enhance={createEnhancer} class="mt-2 flex items-center gap-2">
										<input type="hidden" name="id" value={v.id}>
										<input type="hidden" name="extractExif" value={(!v.extractExif).toString()}>
										<input type="checkbox" class="toggle toggle-xs toggle-primary" checked={v.extractExif} on:change={(e) => e.currentTarget.form?.requestSubmit()} />
										<span class="text-xs text-gray-500 font-medium">Extract EXIF data (including GPS) from photos</span>
									</form>
									<form method="POST" action="?/toggleDeepScan" use:enhance={createEnhancer} class="mt-2 flex items-center gap-2">
										<input type="hidden" name="id" value={v.id}>
										<input type="hidden" name="deepScan" value={(!v.deepScanCollections).toString()}>
										<input type="checkbox" class="toggle toggle-xs toggle-primary" checked={v.deepScanCollections} on:change={(e) => e.currentTarget.form?.requestSubmit()} />
										<span class="text-xs text-gray-500 font-medium">Deep-scan collection imports (extracts detailed attributes for all items in collections)</span>
									</form>
                                    <form method="POST" action="?/toggleBgRemoval" use:enhance={createEnhancer} class="mt-2 flex items-center gap-2">
                                        <input type="hidden" name="id" value={v.id}>
                                        <input type="hidden" name="bgRemovalEnabled" value={(!v.bgRemovalEnabled).toString()}>
                                        <input type="checkbox" class="toggle toggle-xs toggle-primary" checked={v.bgRemovalEnabled} on:change={(e) => e.currentTarget.form?.requestSubmit()} />
                                        <span class="text-xs text-gray-500 font-medium">Remove image backgrounds</span>
                                    </form>
                                    <form method="POST" action="?/toggleBgPreCrop" use:enhance={createEnhancer} class="mt-2 flex items-center gap-2">
                                        <input type="hidden" name="id" value={v.id}>
                                        <input type="hidden" name="bgRemovalPreCrop" value={(!v.bgRemovalPreCrop).toString()}>
                                        <input type="checkbox" class="toggle toggle-xs toggle-primary" checked={v.bgRemovalPreCrop} disabled={!v.bgRemovalEnabled} on:change={(e) => e.currentTarget.form?.requestSubmit()} />
                                        <span class="text-xs text-gray-500 font-medium" class:opacity-50={!v.bgRemovalEnabled}>Pre-crop image before background removal (good for some item-types)</span>
                                    </form>

                                    <form method="POST" action="?/updateInventoryStrategy" use:enhance={createEnhancer} class="mt-2 flex items-center gap-2">
                                        <input type="hidden" name="id" value={v.id}>
                                        <select name="strategy" class="select select-bordered select-xs font-medium" on:change={(e) => e.currentTarget.form?.requestSubmit()} value={v.duplicateStrategy || 'PROMPT'}>
                                            <option value="PROMPT">Ask Me</option>
                                            <option value="AUTO_BUMP">Auto-Merge (+1)</option>
                                            <option value="AUTO_IGNORE">Auto-Ignore</option>
                                        </select>
                                        <span class="text-xs text-gray-500 font-medium">is the default duplicate resolution</span>
                                    </form>

                            <!-- Manual Schema Retry Action -->
                            <form method="POST" action="?/retrySchemaBootstrap" use:enhance={createEnhancer} class="mt-2" on:submit={(e) => { if(!confirm('Are you sure you want to regenerate AI Taxonomy Rules? This will overwrite the current global schema. Existing items will keep their attributes, but they may no longer align with the new structure.')) e.preventDefault(); }}>
                                <input type="hidden" name="inventoryId" value={v.id}>
                                <input type="hidden" name="name" value={v.name}>
                                <button type="submit" class="btn btn-xs btn-outline btn-ghost gap-1 text-[10px]"><i class="bi bi-arrow-repeat"></i> Regenerate AI Taxonomy Rules</button>
                            </form>
                                    
                                    <details class="collapse bg-base-300 mt-2 rounded-xl border border-base-200">
                                        <summary class="collapse-title text-[10px] font-bold px-3 py-2 min-h-0">Raw Taxonomy (JSON)</summary>
                                        <div class="collapse-content px-3 pb-3">
                                            <form method="POST" action="?/updateTaxonomy" use:enhance={createEnhancer} class="flex flex-col gap-2 mt-2">
                                                <input type="hidden" name="id" value={v.id}>
                                                <textarea name="taxonomyJson" class="textarea textarea-bordered font-mono text-[10px] h-64 whitespace-pre leading-tight" spellcheck="false">{JSON.stringify(v.templateFields, null, 2)}</textarea>
                                                <button type="submit" class="btn btn-primary btn-xs self-end shadow-sm">Save JSON</button>
                                            </form>
                                        </div>
                                    </details>
                                </td>
                                <td class="text-right">
                                    {#if deleteConfirmId === v.id}
										<form method="POST" action="?/deleteInventory" use:enhance={() => { return async ({ result, update }) => { if(result.type === 'success') notify('success', 'Inventory deleted'); deleteConfirmId = null; deleteConfirmText = ''; update(); }; }} class="flex items-center gap-2 justify-end">
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

			<div class="divider my-6">System Management</div>
			
			<div class="flex flex-col gap-3">
				<a href="/activity" class="btn btn-outline border-base-300 hover:border-primary flex items-center justify-between h-auto py-4 rounded-xl">
					<div class="flex items-center gap-3">
						<i class="bi bi-activity text-xl text-info"></i>
						<span class="font-bold">System Activity Log</span>
					</div>
					<i class="bi bi-chevron-right text-gray-400"></i>
				</a>
				<a href="/api/backup" target="_blank" class="btn btn-outline border-base-300 hover:border-success flex items-center justify-between h-auto py-4 rounded-xl">
					<div class="flex items-center gap-3">
						<i class="bi bi-database-down text-xl text-success"></i>
						<span class="font-bold">Backup Database</span>
					</div>
					<i class="bi bi-download text-gray-400"></i>
				</a>
			</div>

        </div>
    {/if}
</div>

<CreateInventoryModal bind:this={createInventoryModal} on:success={(e) => notify('success', e.detail)} on:error={(e) => notify('error', e.detail)} />