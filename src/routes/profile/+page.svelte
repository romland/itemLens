<script lang="ts">
    import { enhance } from "$app/forms";
    import DeviceSessionList from "$lib/components/DeviceSessionList.svelte";
    import ActionCard from "$lib/components/ActionCard.svelte";
    import ConfirmModal from "$lib/components/ConfirmModal.svelte";
    import { notify } from "$lib/client/notifications";
    import { clearEntireQueue } from "$lib/client/offlineQueue";
    import { nukeAllCaches } from "$lib/client/utils";
    import pageTitle from '$lib/stores';
    import { page } from "$app/stores";
    import { onMount } from "svelte";

    pageTitle.set("Preferences");
    
    let avatarPreview: string | null = null;
    let confirmModal: ConfirmModal;

    // --- Preferences State ---
    let currentTheme = "";
    onMount(() => {
        currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const observer = new MutationObserver(() => {
            currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    });

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

    let currentPrefs = JSON.parse($page.data.user?.preferences || '{}');
    let shortcuts = {
        newSingle: 'n', newCollection: 'c', settings: 's', profile: 'p',
        editItem: 'e', setDefaultContainer: 'l', goHome: 'h',
        tab1: '1', tab2: '2', tab3: '3', tab4: '4',
        stockInc: '+', stockDec: '-',
        ...(currentPrefs.shortcuts || {})
    };

    function recordKey(e: KeyboardEvent, id: string) {
        e.preventDefault();
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        let combo = [];
        if (e.ctrlKey) combo.push('ctrl');
        if (e.altKey) combo.push('alt');
        if (e.metaKey) combo.push('meta');
        
        if (e.shiftKey && e.key.toLowerCase() !== e.key.toUpperCase()) combo.push('shift');
        combo.push(e.key.toLowerCase());
        shortcuts[id] = combo.join('+');
        shortcuts = shortcuts;
    }

    // --- Form Handlers ---
    function createEnhancer() {
        return async ({ result, update }: any) => {
            if (result.type === 'success' || result.type === 'redirect') {
                notify('success', result.data?.message || 'Saved successfully');
                if (result.data?.message?.includes('Profile')) avatarPreview = null; 
            } else if (result.type === 'failure' || result.type === 'error') {
                notify('error', result.data?.message || 'An error occurred');
            }
            await update({ reset: false });
        };
    }

    function handleFileChange(event: Event) {
        const target = event.target as HTMLInputElement;
        if (target.files && target.files.length > 0) avatarPreview = URL.createObjectURL(target.files[0]);
    }
</script>

<div class="max-w-2xl mx-auto flex flex-col gap-8 pb-12">
    {#if !$page.data.user?.isAdmin && !$page.data.user?.canCreateInventories && $page.data.inventories?.length === 0}
        <div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6 text-center animate-fade-in relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-warning/50"></div>
            <div class="w-16 h-16 bg-warning/10 text-warning rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="bi bi-hourglass-split text-3xl"></i>
            </div>
            <h3 class="font-bold text-lg mb-2">Pending Approval</h3>
            <p class="text-gray-500 text-sm">Your account is created, but you need an administrator to grant you access to an existing collection or permission to create your own.</p>
        </div>
    {/if}

    <!-- PROFILE SECTION -->
    <div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6">
        <h2 class="text-2xl font-bold mb-6">Profile Details</h2>
        <form method="POST" action="?/updateProfile" enctype="multipart/form-data" class="flex flex-col gap-5" use:enhance={createEnhancer}>
            <div class="flex items-center gap-6 mb-2">
                <div class="avatar relative group cursor-pointer" on:click={() => document.getElementById('avatarUpload')?.click()} role="button" tabindex="0">
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
                <input type="text" name="name" value={$page.data.user?.name || ''} class="input input-bordered w-full bg-base-100" />
            </div>
            
            <div class="form-control w-full">
                <label class="label"><span class="label-text font-semibold">Email Address</span></label>
                <input type="email" name="email" value={$page.data.user?.email || ''} class="input input-bordered w-full bg-base-100" />
            </div>
            <button type="submit" class="btn btn-primary mt-2">Save Profile</button>
        </form>
        
        <div class="divider my-6">Password</div>
        <form method="POST" action="?/updatePassword" use:enhance={createEnhancer} class="flex flex-col gap-4">
            <div class="flex flex-col sm:flex-row gap-2">
                <input type="password" name="password" placeholder="New Password" class="input input-bordered w-full bg-base-100">
                <button type="submit" class="btn btn-neutral sm:w-auto">Update Password</button>
            </div>
        </form>
    </div>

    <!-- APPEARANCE SECTION -->
    <div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6">
        <h2 class="text-2xl font-bold mb-1">Appearance</h2>
        <p class="text-sm text-gray-500 mb-5">Set your default viewing modes.</p>
        
        <form method="POST" action="?/updatePreferences" use:enhance={createEnhancer} class="flex items-center gap-3">
            <input type="hidden" name="preferences" value={JSON.stringify({ ...currentPrefs, shortcuts, documentDarkMode: currentPrefs.documentDarkMode })} />
            <input type="checkbox" class="toggle toggle-primary" bind:checked={currentPrefs.documentDarkMode} on:change={(e) => { e.currentTarget.form?.requestSubmit(); }} />
            <div class="flex flex-col"><span class="font-semibold text-sm">Force Dark Mode</span>
            <span class="text-[11px] text-gray-500">Inverts colors mathematically while attempting to preserve image hues.</span></div>
        </form>

        <form method="POST" action="?/updatePreferences" use:enhance={createEnhancer} class="flex items-center gap-3 mt-4 mb-6">
            <input type="hidden" name="preferences" value={JSON.stringify(currentPrefs)} />
            <input type="checkbox" class="toggle toggle-primary" bind:checked={currentPrefs.largeFont} on:change={(e) => { e.currentTarget.form?.requestSubmit(); document.documentElement.style.fontSize = currentPrefs.largeFont ? '110%' : ''; }} />
            <div class="flex flex-col"><span class="font-semibold text-sm">Large Font Mode</span>
            <span class="text-[11px] text-gray-500">Increases base text size for better readability.</span></div>
        </form>

        <h3 class="font-bold text-lg mb-4">Application Theme</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {#each themes as theme}
                <form method="POST" action="/?/setTheme&theme={theme.id}" use:enhance={({ formData }) => {
                    console.log(`[DEBUG-THEME-CLIENT] Form submitted for theme: ${theme.id}`);
                    document.documentElement.setAttribute('data-theme', theme.id);
                    currentTheme = theme.id;
                    return async ({ result }) => {
                        console.log(`[DEBUG-THEME-CLIENT] Server returned result type: ${result.type}`, result);
                        // Force client-side cookie explicitly, to bypass any HttpOnly artifacts
                        document.cookie = `theme=${theme.id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
                    };
                }}>
                    <input type="hidden" name="theme" value={theme.id}>
                    <button type="submit" class="btn h-auto py-4 w-full flex flex-col items-center gap-2 rounded-xl border transition-all {currentTheme === theme.id ? 'border-primary ring-2 ring-primary/30 bg-base-300' : 'border-base-300 hover:border-primary/50 bg-base-200 hover:bg-base-300'}">
                        <i class="bi {theme.icon} text-2xl"></i>
                        <span class="font-semibold text-sm">{theme.name}</span>
                    </button>
                </form>
            {/each}
        </div>
    </div>

    <!-- SHORTCUTS SECTION -->
    <div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6">
        <h3 class="font-bold text-lg mb-1">Keyboard Shortcuts</h3>
        <p class="text-sm text-gray-500 mb-6">Press single keys to navigate faster. These apply globally when not typing.</p>
        
        <form method="POST" action="?/updatePreferences" use:enhance={createEnhancer}>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-6">
                {#each [
                    { id: 'goHome', label: 'Home Page' },
                    { id: 'newSingle', label: 'New Single Item' },
                    { id: 'newCollection', label: 'New MultiScan' },
                    { id: 'profile', label: 'Profile Menu' },
                    { id: 'settings', label: 'Settings' },
                    { id: 'setDefaultContainer', label: 'Set Default Box' },
                    { id: 'editItem', label: 'Edit Current Item' },
                    { id: 'tab1', label: 'Edit Hub: Photos' },
                    { id: 'tab2', label: 'Edit Hub: Location' },
                    { id: 'tab3', label: 'Edit Hub: Details' },
                    { id: 'tab4', label: 'Edit Hub: Links' },
                    { id: 'stockInc', label: 'Stock Up (+)' },
                    { id: 'stockDec', label: 'Stock Down (-)' }
                ] as sc}
                    <div class="flex justify-between items-center bg-base-200/50 p-2 px-3 rounded-lg border border-base-200">
                        <span class="text-sm font-semibold">{sc.label}</span>
                        <input type="text" class="input input-xs input-bordered w-32 text-center font-mono bg-base-100 cursor-pointer" readonly placeholder="Press keys..." on:keydown={(e) => recordKey(e, sc.id)} value={shortcuts[sc.id] || ''} />
                    </div>
                {/each}
            </div>
            <input type="hidden" name="preferences" value={JSON.stringify({ ...currentPrefs, shortcuts })} />
            <button type="submit" class="btn btn-neutral">Save Shortcuts</button>
        </form>
    </div>

    <!-- DEVICES SECTION -->
    <div>
        <h2 class="text-2xl font-bold mb-4">Device Management</h2>
        <div class="bg-base-100 border border-base-200 shadow-sm rounded-xl overflow-hidden mb-6">
            <ActionCard
                title="Clear Offline Cache"
                subtitle="Free up space and force a hard resync on this device."
                icon="bi-trash3-fill"
                iconColorClass="bg-error/10 text-error"
                variant="flat"
                showChevron={false}
                on:click={async () => {
                    const res = await confirmModal.ask('Clear Caches?', 'This will clear all offline data, queues, and force a hard reload. Any pending uploads will be deleted. Continue?', 'Clear', 'Cancel', true);
                    if (res) { await clearEntireQueue(); nukeAllCaches(true); }
                }}
            >
                <i class="bi bi-arrow-clockwise opacity-50"></i>
            </ActionCard>
        </div>

        <h3 class="font-bold text-lg mb-4 mt-2">Connected Sessions</h3>
        <div class="bg-base-100 border border-base-200 shadow-sm rounded-xl p-6">
            <DeviceSessionList sessions={$page.data.activeSessions} currentSessionHash={$page.data.currentSessionHash} />
        </div>
    </div>
</div>

<ConfirmModal bind:this={confirmModal} />