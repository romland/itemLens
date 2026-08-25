<script lang="ts">
	import type { SubmitFunction } from "./$types";
    import { enhance } from "$app/forms";
    import { page } from "$app/stores";
  	import { onNavigate, beforeNavigate, invalidateAll } from '$app/navigation';
    import { browser } from '$app/environment';
    import Search from "$lib/components/search.svelte";
    import ReloadPrompt from "$lib/components/ReloadPrompt.svelte";
    import pageTitle from '$lib/stores';

    // Demo only (show where taps are for recording purposes)
    import TouchIndicator from '$lib/components/TouchIndicator.svelte';

    import "../app.css";

    // Check out the virtual:pwa-info documentation to learn more about the virtually exposed module pwa-info.
    // https://vite-pwa-org.netlify.app/frameworks/#accessing-pwa-info
    import { onMount, onDestroy } from 'svelte'
    // @ts-expect-error virtual module provided by vite-pwa
    import { pwaInfo } from 'virtual:pwa-info'
    import { outboxStore, completedOutboxStore, getQueue, clearQueueItem, deserializeToFormData, updateQueueItemStatus, refreshStore } from '$lib/client/offlineQueue';
	import { nukeAllCaches } from '$lib/client/utils';
    
	import Notifications from "$lib/components/Notifications.svelte";
	import { notifications, notify } from "$lib/client/notifications";

    import KeyboardManager from '$lib/components/KeyboardManager.svelte';
    import ContainerSelector from "$lib/components/ContainerSelector.svelte";
    import CreateInventoryModal from "$lib/components/CreateInventoryModal.svelte";
    import { ambientLocation } from '$lib/client/ambientContext';

    let mounted = false;    

    onMount(async () => {
        mounted = true;
        // Service worker is managed reliably by <ReloadPrompt />.
        // Removing redundant manual registration to prevent race conditions.
    })

    // REALTIME SYNC ENGINE
    if (browser) {
        let evtSource: EventSource | null = null;

        const safeInvalidate = () => {
            const path = window.location.pathname;
            if (path === '/add' || path.includes('/edit') || path.includes('/delete')) {
                console.log("[DEBUG-CACHE] User is mid-workflow. Deferring UI invalidation.");
                return;
            }
            invalidateAll();
        };

        const connectSync = () => {
            if (evtSource) return;
            console.log("[DEBUG-CACHE] 🔌 Attempting to connect SSE...");
            evtSource = new EventSource('/api/events');
            evtSource.onmessage = () => {
                console.log("[DEBUG-CACHE] 🔔 SSE Event received! DB mutated. Firing app-sync & invalidateAll().");

                window.dispatchEvent(new CustomEvent('app-sync'));

                // Refresh SvelteKit UI seamlessly
                // invalidateAll();
                safeInvalidate();
            };
        };

        const disconnectSync = () => {
            if (evtSource) {
                evtSource.close();
                evtSource = null;
            }
        };

        onMount(() => {
            connectSync();
            
            // Aggressive battery saving: Kill connection when app goes to background.
            document.addEventListener('visibilitychange', () => {
                console.log(`[DEBUG-CACHE] 👁️ Visibility changed: ${document.visibilityState} | Network Online: ${navigator.onLine}`);
                if (document.visibilityState === 'visible') {
                    console.log(`[DEBUG-CACHE] 🚀 Waking up! Triggering connectSync & invalidateAll()...`);
                    connectSync();
                    invalidateAll(); // Fetch fresh data to catch up on what we missed while asleep
                } else {
                    console.log(`[DEBUG-CACHE] 💤 Going to sleep. Disconnecting SSE.`);
                    disconnectSync();
                }
            });
        });

        onDestroy(disconnectSync);
    }

    // GLOBAL SYNC ENGINE (Outbox)
    async function processOutbox() {
        if (typeof navigator !== 'undefined' && navigator.locks) {
            await navigator.locks.request('itemlens-outbox-sync', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
                if (lock) await doProcessOutbox();
            });
        } else {
            await doProcessOutbox();
        }
    }

    let isSyncing = false;
    async function doProcessOutbox() {
        if (isSyncing || !navigator.onLine) return;
        isSyncing = true;
        try {
            const queue = await getQueue();
            for (const item of queue) {
                if (item.status === 'syncing') continue;
                await updateQueueItemStatus(item.id!, 'syncing', item.retries);
                try {
                    const fd = deserializeToFormData(item.payload);
                    const cleanEndpoint = item.endpoint.replace('?/default', '');

                    // Emulate SvelteKit native form action to prevent downloading full HTML pages on redirect
                    const res = await fetch(cleanEndpoint, { 
                        method: 'POST', 
                        body: fd,
                        headers: {
                            'x-sveltekit-action': 'true',
                            'accept': 'application/json'
                        }
                    });

                    if (res.ok) {
                        // Bridge the temporal gap between IndexedDB deletion and SvelteKit's fetch resolving
                        completedOutboxStore.update(s => [...s, item]);
                        setTimeout(() => completedOutboxStore.update(s => s.filter(i => i.id !== item.id)), 10000);

                        await clearQueueItem(item.id!);

                        console.log("[DEBUG-LAYOUT] Outbox item synced. Firing sync event.");

                    } else if (res.status === 400 || res.status === 403 || res.status === 404) {
                        // Unrecoverable error (e.g., item deleted, inventory changed, validation failed).
                        // We drop the queue item to prevent an infinite sync loop.
                        console.warn(`[OFFLINE QUEUE] Unrecoverable error ${res.status}. Dropping payload for ${cleanEndpoint}`);
                        await clearQueueItem(item.id!);
                    } else {
                        await updateQueueItemStatus(item.id!, 'failed', item.retries + 1);
                    }
                } catch (e) {
                    await updateQueueItemStatus(item.id!, 'pending', item.retries + 1);
                    break; // Stop syncing if network drops
                }
            }
        } finally {
            isSyncing = false;
        }
    }

    let ambientContainerModal: HTMLDialogElement;
    let loadingContainers = false;
    let globalContainers: any[] = [];
    async function openAmbientModal() {
        ambientContainerModal.showModal();
        if (globalContainers.length === 0) {
            loadingContainers = true;
            try {
                const res = await fetch('/api/containers');
                if (res.ok) globalContainers = await res.json();
            } finally { loadingContainers = false; }
        }
    }

    let mobileMenuModal: HTMLDialogElement;
    let createInventoryModal: CreateInventoryModal;

    let quickNoteModal: HTMLDialogElement;
    let quickNoteTimer: any;
    let quickNoteFired = false;
    let quickNoteReady = false;

    function quickNoteTouchStart(e: Event) {
        clearTimeout(quickNoteTimer);
        quickNoteFired = false;
        quickNoteReady = false;
        quickNoteTimer = setTimeout(() => {
            quickNoteFired = true;
            quickNoteReady = true;
            // Standard vibration for Android (iOS Safari ignores this natively)
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 400); // 400ms long press
    }
    function quickNoteTouchEnd(e: Event) {
        clearTimeout(quickNoteTimer);
        if (quickNoteFired) {
                e.preventDefault(); // stops the href from firing if long press was triggered
                quickNoteModal.showModal();
                const ta = quickNoteModal.querySelector('textarea');
                if (ta) setTimeout(() => ta.focus(), 50);
                // Keep the flag true for a split second to swallow the subsequent click event and gracefully hand off the UI
                setTimeout(() => { quickNoteFired = false; quickNoteReady = false; }, 300);
        } else {
            quickNoteReady = false;
        }
    }

	beforeNavigate(({ type, to, from }) => {
		console.log(`[DEBUG-LAYOUT] beforeNavigate: from ${from?.url?.pathname} to ${to?.url?.pathname}, type: ${type}`);
		
		// SCROLL FIX: We ONLY destroy the infinite-scroll cache if the user explicitly clicks 
		// a navigation link TO a list page (like clicking the 'Home' icon).
		if (type === 'link' && to && from?.url?.pathname !== to.url.pathname) {
			const path = to.url.pathname;
			const isListView = path === '/' || path.startsWith('/search') || path.startsWith('/container') || path.startsWith('/tag');
			
			if (isListView) {
				console.log("[DEBUG-LAYOUT] Navigating to a list view. Clearing nav caches.");
				try {
					Object.keys(sessionStorage).forEach(key => {
						if (key.startsWith('nav-cache-')) sessionStorage.removeItem(key);
					});
				} catch (e) {}
			} else {
				console.log("[DEBUG-LAYOUT] Navigating into item/action. Preserving nav cache.");
			}
		}
    });

    onNavigate((navigation) => {
        // API only supported by Chromium as yet? (At least not Firefox or iOS Safari :/ )
        // https://caniuse.com/view-transitions
        //
        // Safari: https://github.com/WebKit/standards-positions/issues/48
        // Firefox: https://bugzilla.mozilla.org/show_bug.cgi?id=1823896
        if (!document.startViewTransition) {
            console.warn("No startViewTransition");
            return;
        }

        return new Promise((resolve) => {
            document.startViewTransition(async () => {
                resolve();
                await navigation.complete;
            });
        });
    });    

    $: webManifest = pwaInfo ? pwaInfo.webManifest.linkTag : '';

    // TOOD:
    // Testing for more 'live' check of whether we are installed on homescreen or not.
    // It seems the "proper" way is to have a query param, say "installed" or so as base url
    // in the manifest.
    //
    // That said:
    // On my iPhone:
    //  installed: win: 647, scr: 667, full: false (20 pixels less than screen)
    //             To note here is probably if OS pops up password-vault and similar
    //             during this check the window height will likely be less.
    //  in safari: win: 548, scr: 667, full: false (...more)
    //
    
    onMount(() => {
        refreshStore();
        window.addEventListener('online', processOutbox);
        window.addEventListener('outbox-trigger', processOutbox); // Custom event to trigger sync instantly
        processOutbox();
        const outboxInterval = setInterval(processOutbox, 10000); // Failsafe check every 10s
        
        return () => {
            window.removeEventListener('online', processOutbox);
            window.removeEventListener('outbox-trigger', processOutbox);
            clearInterval(outboxInterval);
        };
    });

    // let winHeight = window.innerHeight;
    // let scrHeight = screen.height;
    // let fullScreen = winHeight === scrHeight;
    /*
    <div>
        Win: {winHeight}
        Src: {scrHeight}
        Full: {fullScreen}
    </div>
    */

    let themeColor = "";
    onMount(() => {
        const updateThemeColor = () => {
            const bodyBg = getComputedStyle(document.body).backgroundColor;
            if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)') {
                themeColor = bodyBg;
            }
        };
        updateThemeColor();
        const observer = new MutationObserver(updateThemeColor);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    });

    // Dynamically enable tap visibility
    // Use the classic $: reactive statement instead of $derived
$:  isDemoMode = 
        $page.url.hostname === 'localhost' || 
        $page.url.hostname.startsWith('192.168.178.');

</script>

<svelte:head> 
  {#if mounted && webManifest}{@html webManifest}{/if}
  <title>{$pageTitle} | itemLens</title>
  <meta name="theme-color" content={themeColor || "#1d232a"} />
</svelte:head>

{#if $page.data.user}
    <KeyboardManager preferences={$page.data.user.preferences} />
{/if}

<TouchIndicator enabled={isDemoMode} />

<div class="navbar bg-base-100 sticky top-0" style="z-index: 1;">
  <!-- Mobile menu -->
  <div class="navbar-start pl-3">
    <button on:click={()=>history.back()} class="pt-1" aria-label="Go back">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
    </button>

    <!--
    <div class="hidden lg:block">
        <a href="/" class="btn btn-ghost text-xl">itemLens</a>
    </div>
    -->
    <div class="hidden lg:flex items-center ml-1">
        <a href="/" class="btn btn-ghost normal-case text-xl flex items-center gap-3 px-2 hover:bg-base-200 transition-colors rounded-xl">
            <img src="/itemlens-512-white-outline.webp" alt="itemLens Logo" class="w-9 h-9 rounded-xl object-contain shadow-sm" />
            <span class="font-bold tracking-tight">itemLens</span>
        </a>

        {#if $page.data.inventories && $page.data.inventories.length > 0}
            <form action="/?/switchVault" method="POST" data-sveltekit-reload class="ml-4">
                <select name="inventoryId" class="select select-sm select-ghost font-bold bg-base-200/50" on:change={(e) => { if (e.currentTarget.value === '_new') { e.currentTarget.value = $page.data.activeInventoryId; createInventoryModal.showModal(); } else e.currentTarget.form?.requestSubmit(); }} value={$page.data.activeInventoryId}>
                    {#each $page.data.inventories as inv}
                        <option value={inv.id}>{inv.name}</option>
                    {/each}
                    <!--
                    <option value="_new">+ Create Vault...</option>
                    -->
                </select>
            </form>
        {:else if $page.data.user}
            <button class="btn btn-sm btn-primary ml-4 rounded-xl shadow-sm" on:click={() => createInventoryModal.showModal()}>
                <i class="bi bi-plus-lg"></i> Create Vault
            </button>
        {/if}

    </div>
  </div>

  <div class="navbar-center">
    <!-- Extra Desktop/tablet menu - - >
    <ul class="menu menu-horizontal px-1 hidden lg:flex">
      <li><a>Item 1</a></li>
      <li>
        <details>
          <summary>Parent</summary>
          <ul class="p-2">
            <li><a>Submenu 1</a></li>
            <li><a>Submenu 2</a></li>
          </ul>
        </details>
      </li>
      <li><a>Item 3</a></li>
    </ul>
    -->

    <!-- search; all screens -->
    <div class="form-control items-end">
        <Search />
    </div>
  </div>

  <div class="navbar-end">
    {#if $outboxStore.length > 0}
      <!--div class="tooltip tooltip-bottom mr-2" data-tip="Syncing {$outboxStore.length} items to server"-->
      <div class="tooltip tooltip-left mr-2" data-tip="Syncing {$outboxStore.length} items to server">
        <span class="btn btn-ghost btn-circle text-primary pointer-events-none">
          <span class="indicator">
            <i class="bi bi-cloud-arrow-up text-xl {$outboxStore.some(i => i.status === 'syncing') ? 'animate-pulse' : ''}"></i>
            <span class="badge badge-xs badge-primary indicator-item">{$outboxStore.length}</span>
          </span>
        </span>
      </div>
    {/if}

    <button type="button" id="profile-menu-btn" class="btn btn-ghost btn-circle active:scale-95 transition-transform" on:click={() => mobileMenuModal.showModal()} aria-label="Open Menu">
        {#if $page.data.user}
            <div class="avatar {$page.data.user.avatar ? '' : 'placeholder'}">
                <div class="bg-base-200 text-base-content rounded-full w-9 shadow-sm border border-base-300 overflow-hidden">
                    {#if $page.data.user.avatar}
                        <img src={$page.data.user.avatar} alt="Profile" class="object-cover w-full h-full" />
                    {:else}
                        <span class="text-sm font-bold uppercase">{$page.data.user.name.charAt(0)}</span>
                    {/if}
                </div>
            </div>
        {:else}
            <i class="bi bi-three-dots text-2xl"></i>
        {/if}
    </button>

  </div>
</div>

<main class="container md:w-[800px] px-8 mx-auto my-8" style="padding-bottom: 100px;">
    <slot />
</main>


{#if mounted}
  <ReloadPrompt />
{/if}

<div class="btm-nav" style="z-index: 50; padding-bottom: env(safe-area-inset-bottom); height: calc(5rem + env(safe-area-inset-bottom));">
  <a class="active:scale-95 transition-transform duration-200 flex flex-col items-center justify-center gap-1 {$page.url.pathname==='/' ? 'active' : ''}" href="/">
    <i class="bi bi-house-door text-xl"></i>
    <span class="btm-nav-label text-[10px]">Home</span>
  </a>

  {#if $page.data.user}
      <a class="active:scale-95 transition-transform duration-200 flex flex-col items-center justify-center gap-1 {$page.url.pathname==='/add' ? 'active' : ''}" href="/add" title="Add new item">
          <i class="bi bi-plus-circle text-xl"></i>
          <span class="btm-nav-label text-[10px]">New</span>
      </a>
  {/if}

  <a class="active:scale-95 transition-all duration-200 flex flex-col items-center justify-center gap-1 select-none relative {$page.url.pathname.startsWith('/timeline') ? 'active' : ''} {quickNoteReady ? 'text-primary drop-shadow-md' : ''}" href="/timeline"
     style="-webkit-touch-callout: none; touch-action: none;"
     on:click={(e) => { if (quickNoteFired) e.preventDefault(); }}
     on:pointerdown={quickNoteTouchStart}
     on:pointerup={quickNoteTouchEnd}
     on:pointercancel={quickNoteTouchEnd}
     on:pointerleave={quickNoteTouchEnd}
     on:contextmenu|preventDefault>

    <!-- Floating Indicator that pops up above the thumb when ready -->
    <div class="absolute left-1/2 -translate-x-1/2 transition-all duration-200 pointer-events-none z-50 flex flex-col items-center {quickNoteReady ? '-top-20 opacity-100 scale-110' : 'top-0 opacity-0 scale-50'}">
        <div class="bg-primary text-primary-content px-4 py-2 rounded-full shadow-2xl text-xs font-bold whitespace-nowrap flex items-center gap-2">
            <i class="bi bi-pencil-square text-lg"></i> Release to write
        </div>
        <div class="w-2 h-2 bg-primary rotate-45 -mt-1 rounded-sm"></div>
    </div>

    <i class="bi bi-journal-bookmark text-xl"></i>
    <span class="btm-nav-label text-[10px]">Notebook</span>
  </a>

</div>

<dialog bind:this={quickNoteModal} class="modal modal-top sm:modal-middle backdrop-blur-sm" on:paste|stopPropagation>
   <div class="modal-box mt-8 sm:mt-0 rounded-3xl sm:rounded-[2.5rem] p-6 bg-base-100 shadow-2xl border border-base-200">
       <h3 class="font-bold text-lg mb-4">Quick Note</h3>
       <form method="POST" action="/timeline?/capture" use:enhance={({ formElement }) => {
           quickNoteModal.close();
           return async ({ result }) => { 
               if (result.type === 'success' || result.type === 'redirect') {
                   formElement.reset(); 
                   notify('success', 'Note saved to Notebook!');
               } else {
                   notify('error', 'Failed to save note.');
               }
           };
       }}>
           <textarea name="content" placeholder="Jot something down..." class="textarea textarea-bordered w-full resize-none h-32 rounded-xl mb-4"></textarea>
           <div class="modal-action mt-0 flex gap-2">
               <button type="button" class="btn btn-ghost flex-1 rounded-xl" on:click={() => quickNoteModal.close()}>Cancel</button>
               <button type="submit" class="btn btn-primary flex-1 rounded-xl shadow-md">Save Note</button>
           </div>
       </form>
   </div>
   <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<Notifications bind:notifications={$notifications} />

<!-- Global Ambient Container Selector -->
<dialog bind:this={ambientContainerModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box p-4 bg-base-100 shadow-2xl border border-base-200 sm:rounded-[2.5rem]">
        <h3 class="font-bold text-xl mb-1">Set Default Location</h3>
        <p class="text-xs text-gray-500 mb-4">This location will be automatically assigned to items you scan in this session.</p>
        {#if loadingContainers}
            <div class="flex justify-center p-8"><span class="loading loading-spinner text-primary"></span></div>
        {:else}
            <ContainerSelector containers={globalContainers} values={$ambientLocation.map(name => ({ container: { name } }))} defaultTab="select" on:change={(e) => { ambientLocation.setContext(e.detail.containers); ambientContainerModal.close(); }} />
        {/if}
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<CreateInventoryModal bind:this={createInventoryModal} on:success={(e) => { notify('success', e.detail); window.location.reload(); }} on:error={(e) => notify('error', e.detail)} />

<!-- Bottom Sheet Menu -->
<dialog bind:this={mobileMenuModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
    <div class="modal-box sm:rounded-[2.5rem] p-4 sm:p-6 bg-base-100/95 shadow-2xl border border-base-200">
        <div class="flex justify-between items-center mb-6 px-2">
            <h3 class="font-bold text-2xl tracking-tight">Menu</h3>
            <button type="button" class="btn btn-sm btn-circle btn-ghost bg-base-200/50" on:click={() => mobileMenuModal.close()}>✕</button>
        </div>

        <div class="flex flex-col gap-3">
            {#if $page.data.inventories && $page.data.inventories.length > 1}
                <div class="bg-base-200/50 rounded-2xl border border-base-200 overflow-hidden flex flex-col shadow-sm mb-1">
                    <div class="flex items-center gap-4 p-4">
                        <div class="w-10 h-10 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0">
                            <i class="bi bi-safe2-fill text-xl"></i>
                        </div>
                        <div class="flex-1">
							<div class="text-[10px] uppercase font-bold text-gray-500 mb-1 tracking-wider">Active Inventory</div>
                            <form action="/?/switchVault" method="POST" data-sveltekit-reload>
                                <select name="inventoryId" class="select select-sm select-ghost font-bold w-full p-0 h-auto min-h-0 bg-transparent focus:bg-transparent text-lg shadow-none" on:change={(e) => { if (e.currentTarget.value === '_new') { mobileMenuModal.close(); e.currentTarget.value = $page.data.activeInventoryId; createInventoryModal.showModal(); } else e.currentTarget.form?.requestSubmit(); }} value={$page.data.activeInventoryId}>
                                    {#each $page.data.inventories as inv}
                                        <option value={inv.id}>{inv.name}</option>
                                    {/each}
                                    <!--
                                    <option value="_new">+ Create Vault...</option>
                                    -->
                                </select>
                            </form>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Group 1: Navigation -->
            <div class="bg-base-200/50 rounded-2xl border border-base-200 overflow-hidden flex flex-col shadow-sm">
                {#if $page.data.user}
                    <a href="/container" class="flex items-center gap-4 p-4 hover:bg-base-200 transition-colors active:bg-base-300" on:click={() => mobileMenuModal.close()}>
                        <div class="w-10 h-10 rounded-full bg-info/10 text-info flex items-center justify-center shrink-0">
                            <i class="bi bi-box-seam-fill text-xl"></i>
                        </div>
                        <div class="flex-1 font-semibold text-lg">Containers</div>
                        <i class="bi bi-chevron-right text-gray-400"></i>
                    </a>

                    <a href="/categories" class="flex items-center gap-4 p-4 hover:bg-base-200 transition-colors active:bg-base-300" on:click={() => mobileMenuModal.close()}>
                        <div class="w-10 h-10 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
                            <i class="bi bi-tags-fill text-xl"></i>
                        </div>
                        <div class="flex-1 font-semibold text-lg">Categories</div>
                        <i class="bi bi-chevron-right text-gray-400"></i>
                    </a>
                {/if}
            </div>

            <!-- Group 2: Sign out -->
            <div class="bg-base-200/50 rounded-2xl border border-base-200 overflow-hidden flex flex-col shadow-sm mt-2">
                <a href="/settings" class="flex items-center gap-4 p-4 hover:bg-base-200 transition-colors active:bg-base-300" on:click={() => mobileMenuModal.close()}>
                    <div class="w-10 h-10 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0">
                        <i class="bi bi-gear-fill text-xl"></i>
                    </div>
                    <div class="flex-1 font-semibold text-lg">Settings & Profile</div>
                    <i class="bi bi-chevron-right text-gray-400"></i>
                </a>

                <!-- This button is currently hidden, it feels a bit excessive; press the (by default) "L" keybind to get to it -->
                <button style="display: none;" type="button" id="ambient-container-btn" class="flex items-center gap-4 p-4 hover:bg-base-200 transition-colors active:bg-base-300 w-full text-left" on:click={() => { mobileMenuModal.close(); openAmbientModal(); }}>
                    <div class="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <i class="bi bi-pin-angle-fill text-xl"></i>
                    </div>
                    <div class="flex-1 font-semibold text-lg flex flex-col leading-tight"><span>Set Default Location</span> <span class="text-xs text-gray-500 font-normal">{$ambientLocation.length ? $ambientLocation.join(', ') : 'None'}</span></div>
                    <i class="bi bi-chevron-right text-gray-400"></i>
                </button>

				{#if $page.data.user?.isAdmin}
					<button type="button" class="flex items-center gap-4 p-4 hover:bg-error/10 hover:text-error transition-colors active:bg-base-300 w-full text-left" on:click={() => { mobileMenuModal.close(); nukeAllCaches(); }}>
						<div class="w-10 h-10 rounded-full bg-error/10 text-error flex items-center justify-center shrink-0">
							<i class="bi bi-trash3 text-xl"></i>
						</div>
						<div class="flex-1 font-semibold text-lg">Clear Cache</div>
					</button>
				{/if}

                {#if !$page.data.user}
                    <a href="/login" class="flex items-center gap-4 p-4 hover:bg-base-200 transition-colors active:bg-base-300" on:click={() => mobileMenuModal.close()}>
                        <div class="w-10 h-10 rounded-full bg-base-300 text-base-content flex items-center justify-center shrink-0">
                            <i class="bi bi-box-arrow-in-right text-xl"></i>
                        </div>
                        <div class="flex-1 font-semibold text-lg">Log in</div>
                    </a>
                {:else}
                    <form method="POST" action="/logout" use:enhance on:submit={() => mobileMenuModal.close()} class="m-0">
                        <button type="submit" class="flex items-center gap-4 p-4 hover:bg-base-200 transition-colors active:bg-base-300 w-full text-left">
                            <div class="w-10 h-10 rounded-full bg-base-300 text-base-content flex items-center justify-center shrink-0">
                                <i class="bi bi-box-arrow-right text-xl"></i>
                            </div>
                            <div class="flex-1 font-semibold text-lg">Sign out</div>
                        </button>
                    </form>
                {/if}
            </div>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>
