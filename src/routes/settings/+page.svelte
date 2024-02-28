<script lang="ts">
    import type { ActionData } from "./$types";
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import { page } from "$app/stores";

    export let form: ActionData;

    const updateTheme: SubmitFunction = ({ action }) => {
        const theme = action.searchParams.get('theme');

        if (theme) {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }


    import pageTitle from '$lib/stores';
    pageTitle.set("Settings");
</script>

{#if form?.error}
    <Alert>{@html form?.message}</Alert>
{/if}

    <form method="post" use:enhance>
        <div class="mb-3">
            <input type="password" name="password" placeholder="Password"  class="input input-bordered w-full">
        </div>
        <div class="inline-flex items-center gap-3">
            <button type="submit" class="btn btn-primary">Change Password</button>
        </div>
    </form>

    <form method="post" class="form-control" use:enhance={updateTheme}>
        <ul class="p-2">
            <li><button formaction="/?theme=light&redirectTo={$page.url.pathname}">Light</button></li> 
            <li><button formaction="/?theme=dark&redirectTo={$page.url.pathname}">Dark</button></li> 
        </ul>
    </form>
