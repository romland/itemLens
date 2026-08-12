<script lang="ts">
    import type { PageServerData } from './$types';
    import { enhance } from '$app/forms';
    import pageTitle from '$lib/stores';
    import { slide } from 'svelte/transition';
    import Notifications from "$lib/components/Notifications.svelte";

    export let data: PageServerData;
    
    $: pageTitle.set('Categories');

    let searchQuery = "";
    $: filteredCategories = data.categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

    let categoryToDelete: any = null;
    let confirmModal: HTMLDialogElement;
    let isDeleting = false;
    let notifications: any[] = [];

    $: if (confirmModal) {
        if (categoryToDelete && !confirmModal.open) confirmModal.showModal();
        if (!categoryToDelete && confirmModal.open) confirmModal.close();
    }

    function notify(status: string, message: string) {
        const id = Math.random().toString(36);
        notifications = [...notifications, { id, status, message }];
        setTimeout(() => notifications = notifications.filter(n => n.id !== id), 3000);
    }

</script>

<div class="max-w-2xl mx-auto pt-4 pb-20 px-4 sm:px-0">
    <h1 class="text-3xl font-bold mb-6 tracking-tight">Categories</h1>

    <!-- Search Bar -->
    <div class="bg-base-200/50 rounded-xl p-2 flex items-center gap-2 mb-6 border border-base-200 shadow-inner">
        <i class="bi bi-search text-gray-400 ml-2"></i>
        <input type="text" bind:value={searchQuery} placeholder="Search categories..." class="bg-transparent border-none focus:outline-none w-full text-base" />
        {#if searchQuery}
            <button class="btn btn-ghost btn-circle btn-xs mr-1" on:click={() => searchQuery = ""}><i class="bi bi-x-circle-fill text-gray-400"></i></button>
        {/if}
    </div>
    
    <!-- Inset Grouped List -->
    <div class="bg-base-100 rounded-[1.5rem] border border-base-200 shadow-sm overflow-hidden">
        <div class="flex flex-col divide-y divide-base-200">
            {#each filteredCategories as cat (cat.id)}
                <div class="flex items-center justify-between p-4 hover:bg-base-50 transition-colors" transition:slide|local={{ duration: 250 }}>
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <i class="bi bi-tag-fill"></i>
                        </div>
                        <div>
                            <div class="font-semibold text-lg capitalize tracking-tight">{cat.name}</div>
                            <div class="text-xs text-gray-500 font-medium">{cat._count.photos} {cat._count.photos === 1 ? 'photo' : 'photos'} linked</div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-ghost btn-circle text-gray-400 hover:text-error hover:bg-error/10 transition-colors" on:click={() => categoryToDelete = cat} aria-label="Delete Category">
                        <i class="bi bi-trash text-lg"></i>
                    </button>
                </div>
            {:else}
                <div class="p-8 text-center text-gray-400 flex flex-col items-center gap-3">
                    <div class="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center">
                        <i class="bi bi-tags text-2xl opacity-50"></i>
                    </div>
                    <span class="font-medium">No categories found.</span>
                </div>
            {/each}
        </div>
    </div>
</div>

<!-- Action Sheet Modal -->
<dialog bind:this={confirmModal} class="modal modal-bottom sm:modal-middle" on:close={() => categoryToDelete = null}>
    <div class="modal-box sm:rounded-[2rem] p-6">
        <h3 class="font-bold text-xl mb-2 text-center sm:text-left">Delete Category?</h3>
        <p class="text-gray-500 text-center sm:text-left text-sm mb-6">
            Are you sure you want to delete <strong class="text-base-content capitalize">"{categoryToDelete?.name}"</strong>? 
            <br><br>
            This will unlink it from <strong>{categoryToDelete?._count.photos}</strong> photo(s). The photos will remain, but the category tag will be removed.
        </p>
        <div class="flex flex-col sm:flex-row-reverse gap-2 sm:gap-3">
            <form method="POST" action="?/delete" class="w-full sm:w-auto flex-1" use:enhance={() => {
                isDeleting = true;
                return async ({ update }) => {
                    await update();
                    isDeleting = false;
                    categoryToDelete = null;
                    notify('success', 'Category deleted and unlinked.');
                };
            }}>
                <input type="hidden" name="id" value={categoryToDelete?.id}>
                <button type="submit" class="btn btn-error w-full text-white shadow-sm rounded-xl" disabled={isDeleting}>
                    {#if isDeleting}
                        <span class="loading loading-spinner"></span>
                    {:else}
                        Delete Category
                    {/if}
                </button>
            </form>
            <button class="btn btn-ghost w-full sm:w-auto flex-1 rounded-xl bg-base-200/50" on:click={() => categoryToDelete = null} disabled={isDeleting}>Cancel</button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button disabled={isDeleting}>close</button>
    </form>
</dialog>

<Notifications bind:notifications />
