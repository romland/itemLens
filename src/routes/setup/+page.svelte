<script lang="ts">
    import { enhance } from "$app/forms";
    import FormInput from "$lib/components/FormInput.svelte";
    import SystemDiagnostics from "$lib/components/SystemDiagnostics.svelte";
    import CreateInventoryModal from "$lib/components/CreateInventoryModal.svelte";
    import pageTitle from '$lib/stores';

    export let data;
    export let form;
    
    let isSubmitting = false;
    let step = 1; // 1: Admin, 2: Collection Prompt, 3: Done
    let createModal: CreateInventoryModal;

    pageTitle.set("System Setup");
</script>

<div class="min-h-[85vh] flex items-center justify-center p-4">
    <div class="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
        
        <!-- LEFT: Setup Wizard Flow -->
        <div class="bg-base-100/90 backdrop-blur-2xl border border-base-200 shadow-2xl rounded-[2.5rem] p-8 sm:p-10 animate-fade-in">
            <div class="flex justify-start mb-6">
                <img src="/itemlens-512-white-outline.webp" alt="itemLens Logo" class="w-16 h-16 rounded-2xl object-contain shadow-sm bg-base-300 p-2" />
            </div>
            
            <h1 class="text-3xl sm:text-4xl font-bold tracking-tight text-base-content mb-2">Welcome to itemLens</h1>
            
            {#if step === 1}
                <p class="text-sm text-gray-500 mb-8 font-medium">Create your master administrator account to get started.</p>

                {#if form?.error}
                    <div class="mb-6 animate-fade-in">
                        <span class="text-sm font-medium text-error bg-error/10 px-4 py-3 rounded-xl inline-flex items-center gap-2 w-full">
                            <i class="bi bi-exclamation-circle-fill"></i> {@html form.message}
                        </span>
                    </div>
                {/if}

                <form method="post" class="flex flex-col gap-5" use:enhance={() => {
                    isSubmitting = true;
                    return async ({ result, update }) => { 
                        if (result.type === 'success') {
                            step = 2; // Account created, cookie set! Reveal collection prompt.
                        } else {
                            await update(); 
                        }
                        isSubmitting = false; 
                    };
                }}>
                    <div class="space-y-4">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400">Master Admin Account</h3>
                        <div class="flex flex-col gap-4">
                            <FormInput autocomplete="username" icon="bi-person" inputClass="bg-base-200/50 focus:bg-base-100 shadow-inner" name="username" placeholder="Username" required/>
                            <FormInput autocomplete="new-password" icon="bi-shield-lock" inputClass="bg-base-200/50 focus:bg-base-100 shadow-inner" name="password" placeholder="Password" required type="password"/>
                        </div>
                    </div>

                    <button type="submit" class="btn btn-primary w-full rounded-xl shadow-lg text-base h-14 mt-4" disabled={isSubmitting}>
                        {#if isSubmitting}
                            <span class="loading loading-spinner"></span> Creating Account...
                        {:else}
                            Create Admin Account
                        {/if}
                    </button>
                </form>

            {:else if step === 2}
                <div class="flex flex-col gap-4 py-4 animate-fade-in">
                    <div class="flex items-center gap-3 text-success font-bold text-lg mb-2">
                        <i class="bi bi-check-circle-fill text-2xl"></i> Account Created
                    </div>
                    <p class="text-gray-600 text-sm">Before you can start adding items, you need to create your first collection. Click below to configure your default settings.</p>
                    
                    <button type="button" class="btn btn-primary w-full rounded-xl shadow-lg h-14 mt-2" on:click={() => createModal.showModal()}>
                        Open Collection Creator
                    </button>
                </div>

            {:else if step === 3}
                <div class="flex flex-col gap-4 py-4 animate-fade-in">
                    <div class="flex items-center gap-3 text-success font-bold text-lg mb-2">
                        <i class="bi bi-check-circle-fill text-2xl"></i> Collection Ready
                    </div>
                    <p class="text-gray-600 text-sm">Everything is set up. You can now enter the application.</p>
                    
                    <button type="button" class="btn btn-success text-white w-full rounded-xl shadow-lg h-14 mt-2" on:click={() => window.location.href = '/'}>
                        Complete Setup & Enter
                    </button>
                </div>
            {/if}
        </div>

        <!-- RIGHT: System Diagnostics -->
        <div class="bg-base-200/50 backdrop-blur-xl border border-base-200 shadow-lg rounded-[2.5rem] p-8 sm:p-10 animate-fade-in" style="animation-delay: 100ms;">
            <SystemDiagnostics diagnostics={data.diagnostics} />
        </div>
        
    </div>
</div>

<!-- The DRY Collection Modal - Updates to Step 3 when successfully saved -->
<CreateInventoryModal bind:this={createModal} on:success={() => step = 3} />