<script lang="ts">
    import { enhance } from "$app/forms";
    import type { ActionData } from "./$types";
    import pageTitle from '$lib/stores';

    export let form: ActionData;
    let isRegistering = false;

    pageTitle.set("Create Account");
</script>

<div class="min-h-[80vh] flex items-center justify-center px-4 py-12">
    <div class="max-w-sm w-full bg-base-100/90 backdrop-blur-2xl border border-base-200 shadow-2xl rounded-[2.5rem] p-8 sm:p-10 animate-fade-in">
        <div class="flex justify-center mb-6">
            <div class="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-sm border border-primary/20">
                <i class="bi bi-person-plus-fill text-3xl"></i>
            </div>
        </div>
        
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-center text-base-content mb-2">Create an account</h1>
        <p class="text-sm text-gray-500 text-center mb-8 font-medium">Set up your personal inventory vault.</p>

        {#if form?.error}
            <div class="mb-4 text-center animate-fade-in">
                <span class="text-[13px] font-medium text-error bg-error/10 px-4 py-2 rounded-xl inline-flex items-center gap-2">
                    <i class="bi bi-exclamation-circle-fill"></i> {@html form?.message}
                </span>
            </div>
        {/if}

        <form method="post" class="flex flex-col gap-4" use:enhance={() => {
            isRegistering = true;
            return async ({ update }) => { await update(); isRegistering = false; };
        }}>
            <div class="form-control relative w-full">
                <i class="bi bi-person absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none"></i>
                <input type="text" name="username" placeholder="Choose a Username" class="input input-bordered w-full pl-12 rounded-xl bg-base-200/50 focus:bg-base-100 transition-colors shadow-inner" required autocomplete="username">
            </div>
            
            <div class="form-control relative w-full mb-2">
                <i class="bi bi-shield-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none"></i>
                <input type="password" name="password" placeholder="Create a Password" class="input input-bordered w-full pl-12 rounded-xl bg-base-200/50 focus:bg-base-100 transition-colors shadow-inner" required autocomplete="new-password">
            </div>

            <button type="submit" class="btn btn-primary w-full rounded-xl shadow-lg text-base h-12" disabled={isRegistering}>
                {#if isRegistering}<span class="loading loading-spinner loading-sm"></span>{/if}
                Register
            </button>

            <div class="text-center mt-6">
                <span class="text-sm text-gray-500">Already have an account?</span>
                <a href="/login" class="text-sm text-primary font-bold hover:underline ml-1">Sign in</a>
            </div>
        </form>
    </div>
</div>
