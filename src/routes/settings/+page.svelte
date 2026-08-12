<script lang="ts">
    import type { ActionData } from "./$types";
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";
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
                <form method="POST" action="/?theme={theme.id}&redirectTo=/settings" use:enhance={() => {
                    // Instantly apply the theme in the browser while the server saves the cookie
                    document.documentElement.setAttribute('data-theme', theme.id);
                    return async ({ update }) => {
                        await update({ reset: false });
                    };
                }}>
                    <button type="submit" class="btn h-auto py-4 w-full flex flex-col items-center gap-2 rounded-xl border border-base-300 hover:border-primary bg-base-200 hover:bg-base-300 transition-all">
                        <i class="bi {theme.icon} text-2xl"></i>
                        <span class="font-semibold text-sm">{theme.name}</span>
                    </button>
                </form>
            {/each}
        </div>
    </div>
</div>

    <form method="post" class="form-control" use:enhance={updateTheme}>
        <ul class="p-2">
            <li><button formaction="/?theme=light&redirectTo={$page.url.pathname}">Light</button></li> 
            <li><button formaction="/?theme=dark&redirectTo={$page.url.pathname}">Dark</button></li> 
        </ul>
    </form>
