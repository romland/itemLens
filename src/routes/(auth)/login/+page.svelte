<script lang="ts">
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import type { ActionData } from "./$types";
    import pageTitle from '$lib/stores';

    export let form: ActionData;

	let isLoggingIn = false;

    pageTitle.set("Log in");
</script>

<div class="min-h-[80vh] flex items-center justify-center px-4 py-12">
    <div class="max-w-sm w-full bg-base-100/90 backdrop-blur-2xl border border-base-200 shadow-2xl rounded-[2.5rem] p-8 sm:p-10 animate-fade-in">
        <div class="flex justify-center mb-6">
            <img src="/itemlens-512-white-outline.webp" alt="itemLens Logo" class="w-16 h-16 rounded-2xl object-contain shadow-sm bg-base-300 p-2" />
        </div>
        
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-center text-base-content mb-2">Welcome back</h1>
        <p class="text-sm text-gray-500 text-center mb-8 font-medium">Enter your details to sign in to your collections.</p>

        {#if form?.error}
            <div class="mb-6 animate-fade-in">
                <Alert>{@html form?.message}</Alert>
            </div>
        {/if}

        <form method="post" class="flex flex-col gap-4" use:enhance={() => {
            isLoggingIn = true;
            return async ({ update }) => {
                await update();
                isLoggingIn = false;
            };
        }}>
            <div class="form-control relative w-full">
                <i class="bi bi-person absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none"></i>
                <input type="text" name="username" placeholder="Username" class="input input-bordered w-full pl-12 rounded-xl bg-base-200/50 focus:bg-base-100 transition-colors shadow-inner" required autocomplete="username">
            </div>
            
            <div class="form-control relative w-full mb-2">
                <i class="bi bi-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none"></i>
                <input type="password" name="password" placeholder="Password" class="input input-bordered w-full pl-12 rounded-xl bg-base-200/50 focus:bg-base-100 transition-colors shadow-inner" required autocomplete="current-password">
            </div>

            <button type="submit" class="btn btn-primary w-full rounded-xl shadow-lg text-base h-12" disabled={isLoggingIn}>
                {#if isLoggingIn}<span class="loading loading-spinner loading-sm"></span>{/if}
                Sign In
            </button>

            <div class="text-center mt-6">
                <span class="text-sm text-gray-500">Don't have an account?</span>
                <a href="/register" class="text-sm text-primary font-bold hover:underline ml-1">Create one</a>
            </div>
        </form>
    </div>
</div>
