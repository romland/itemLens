<script lang="ts">
    import type { ActionData, PageServerData } from "./$types";
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/alert.svelte";
    import pageTitle from '$lib/stores';

    export let data: PageServerData;
    export let form: ActionData;

    pageTitle.set("Profile");
    
    let avatarPreview: string | null = null;
    
    function handleFileChange(event: Event) {
        const target = event.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
            avatarPreview = URL.createObjectURL(target.files[0]);
        }
    }
</script>

<div class="max-w-2xl mx-auto pt-4 pb-20 px-4 sm:px-0">
    <h1 class="text-3xl font-bold mb-6 tracking-tight">Profile</h1>

    {#if form?.error}
        <div class="mb-4"><Alert>{@html form.message}</Alert></div>
    {:else if form?.success}
        <div class="alert alert-success shadow-sm rounded-xl mb-4 text-white">
            <i class="bi bi-check-circle"></i>
            <span>{form.message}</span>
        </div>
    {/if}

    <!-- Profile Settings Group -->
    <div class="bg-base-100 border border-base-200 shadow-sm rounded-[1.5rem] overflow-hidden mb-8 p-6">
        <form method="POST" action="?/updateProfile" enctype="multipart/form-data" class="flex flex-col gap-5" use:enhance={() => {
            return async ({ update }) => {
                await update({ reset: false });
                avatarPreview = null; // Drop the local preview to reveal the server's truth
            };
        }}>
            
            <!-- Avatar Upload -->
            <div class="flex items-center gap-6 mb-2">
                <div class="avatar relative group cursor-pointer" on:click={() => document.getElementById('avatarUpload')?.click()}>
                    <div class="w-24 rounded-full border-4 border-base-100 shadow-md bg-base-200">
                        {#if avatarPreview}
                            <img src={avatarPreview} alt="Preview" class="object-cover" />
                        {:else if data.user?.avatar}
                            <img src={data.user.avatar} alt="Current avatar" class="object-cover" />
                        {:else}
                            <div class="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-400">
                                {data.user?.name ? data.user.name.charAt(0).toUpperCase() : '?'}
                            </div>
                        {/if}
                    </div>
                    <div class="absolute bottom-0 right-0 bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center shadow-sm border-2 border-base-100">
                        <i class="bi bi-camera-fill text-xs"></i>
                    </div>
                </div>
                <input type="file" id="avatarUpload" name="avatar" accept="image/*" class="hidden" on:change={handleFileChange} />
                <div class="text-sm text-gray-500">Tap to upload a new profile picture.</div>
            </div>

            <div class="form-control w-full">
                <label class="label"><span class="label-text font-semibold">Display Name</span></label>
                <input type="text" name="name" value={data.user?.name || ''} placeholder="John Doe" class="input input-bordered w-full rounded-xl bg-base-50 focus:bg-base-100 transition-colors">
            </div>
            <div class="form-control w-full">
                <label class="label"><span class="label-text font-semibold">Email Address</span></label>
                <input type="email" name="email" value={data.user?.email || ''} placeholder="john@example.com" class="input input-bordered w-full rounded-xl bg-base-50 focus:bg-base-100 transition-colors">
            </div>
            <button type="submit" class="btn btn-primary mt-2 rounded-xl">Save Profile</button>
        </form>
    </div>

    <!-- Security Group -->
    <h2 class="text-xl font-bold mb-4 tracking-tight px-2">Security</h2>
    <div class="bg-base-100 border border-base-200 shadow-sm rounded-[1.5rem] overflow-hidden p-6">
        <form method="POST" action="?/updatePassword" use:enhance class="flex flex-col gap-4">
            <input type="password" name="password" placeholder="New Password" class="input input-bordered w-full rounded-xl bg-base-50 focus:bg-base-100 transition-colors">
            <div class="text-xs text-gray-400 pl-1">Must be at least 1 character long.</div>
            <button type="submit" class="btn btn-neutral mt-2 rounded-xl">Change Password</button>
        </form>
    </div>
</div>