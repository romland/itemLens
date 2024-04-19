<script lang="ts">
	import type { SubmitFunction } from "./$types";
    import { enhance } from "$app/forms";
    import { page } from "$app/stores";
    import { onNavigate } from '$app/navigation';
    import Search from "$lib/components/search.svelte";

    import "../app.css";

    // Check out the virtual:pwa-info documentation to learn more about the virtually exposed module pwa-info.
    // https://vite-pwa-org.netlify.app/frameworks/#accessing-pwa-info
    import { onMount } from 'svelte'
    import { pwaInfo } from 'virtual:pwa-info'
    
    onMount(async () => {
        if (pwaInfo) {
            const { registerSW } = await import('virtual:pwa-register')
            registerSW({
                immediate: true,
                onRegistered(r) {
                    // uncomment following code if you want check for updates
                    r && setInterval(() => {
                        console.log('Checking for sw update')
                        r.update()
                    }, 20000 /* 20s for testing purposes */)
                    console.log(`SW Registered: ${r}`)
                },
                onRegisterError(error) {
                    console.log('SW registration error', error)
                }
            })
        }
    })


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
    
    $: webManifest = pwaInfo ? pwaInfo.webManifest.linkTag : ''

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

    import pageTitle from '$lib/stores';
</script>

<svelte:head> 
  {@html webManifest} 
  <title>{$pageTitle} | itemLens</title>
</svelte:head>

<div class="navbar bg-base-100 sticky top-0" style="z-index: 1;">
  <!-- Mobile menu -->
  <div class="navbar-start pl-3">
    <button on:click={()=>history.back()} class="pt-1">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
    </button>

    <div class="hidden lg:block">
        <a href="/" class="btn btn-ghost text-xl">itemLens</a>
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
    <div class="dropdown dropdown-end">
      <div tabindex="0" role="button" class="btn btn-ghost ">
        <div class="w-10 ">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8m-8 6h16" /></svg>
        </div>
      </div>
      <ul tabindex="0" class="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content  bg-slate-800 rounded-box w-52">
        <li>
          <a class="between">
            <i class="bi bi-gear"></i>
            <span class="btm-nav-label">Profile</span>
            <span class="badge">New</span>
          </a>
        </li>

        {#if $page.data.user}
            <li>
                <a href="/container" title="Containers">
                    <i class="bi bi-gear"></i>
                    <span class="btm-nav-label">Containers</span>
                </a>
            </li>
            <li>
                <a href="/settings" title="Settings">
                    <i class="bi bi-gear"></i>
                    <span class="btm-nav-label">Settings</span>
                </a>
            </li>
        {/if}

        <li>
            {#if !$page.data.user}
                <a href="/login" title="Sign In">
                    <i class="bi bi-box-arrow-in-right"></i>
                    <span class="btm-nav-label">Log in</span>
                </a>
            {:else}
                <form method="POST" action="/logout" use:enhance>
                    <button type="submit" title="Sign Out">
                        <i class="bi bi-box-arrow-right"></i>
                        <span class="p-1 btm-nav-label">Sign out</span>
                    </button>
                </form>
            {/if}
        </li>
      </ul>
    </div>
  </div>
</div>

<main class="container md:w-[800px] px-8 mx-auto my-8" style="padding-bottom: 100px;">
    <slot />
</main>


{#await import('$lib/components/ReloadPrompt.svelte') then { default: ReloadPrompt}}
  <ReloadPrompt />
{/await}

<div class="btm-nav" style="z-index: 1;">
  <a class:active={$page.url.pathname==='/'} href="/">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
    <span class="btm-nav-label">Home</span>
  </a>

  {#if $page.data.user}
      <a class:active={$page.url.pathname==='/add'} href="/add" title="Add new item">
          <i class="bi bi-plus-circle"></i>
          <span class="btm-nav-label">Add new</span>
      </a>
  {/if}

  <a class:active={$page.url.pathname==='???'} href="">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    <span class="btm-nav-label">Something</span>
  </a>

</div>
