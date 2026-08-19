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
    
    let addModal: HTMLDialogElement;
    let isAdding = false;
    let newCategoryName = "";

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
    <div class="flex items-center justify-between mb-2">
        <h1 class="text-3xl font-bold tracking-tight">Categories</h1>
        <button type="button" class="btn btn-circle btn-primary shadow-sm" on:click={() => addModal.showModal()} aria-label="Add Category">
            <i class="bi bi-plus-lg text-xl"></i>
        </button>
    </div>
    <p class="text-gray-500 text-sm mb-6 leading-relaxed">
        This list serves as a preferred set to guide the LLM when organizing your items. If a newly scanned item doesn't fit into an existing category, a new one is created automatically.
    </p>

    <!-- Search Bar -->
    <div class="bg-base-200/50 rounded-xl p-2 flex items-center gap-2 mb-6 border border-base-200 shadow-inner">
        <i class="bi bi-search text-gray-400 ml-2"></i>
        <input type="text" bind:value={searchQuery} placeholder="Search categories..." class="bg-transparent border-none focus:outline-none w-full text-base" />
        {#if searchQuery}
            <button class="btn btn-ghost btn-circle btn-xs mr-1" on:click={() => searchQuery = ""} aria-label="Clear search"><i class="bi bi-x-circle-fill text-gray-400"></i></button>
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
							<a href="/search?category={encodeURIComponent(cat.name)}" class="font-semibold text-lg capitalize tracking-tight hover:underline text-base-content block">
								{cat.name}
							</a>
                            <div class="text-xs text-gray-500 font-medium">{cat._count.photos} {cat._count.photos === 1 ? 'photo' : 'photos'} linked</div>
                        </div>
                    </div>
                    
                    <div class="hidden sm:flex items-center gap-2 mr-4">
                        <span class="text-xs text-gray-500 font-semibold uppercase tracking-wider">Duplicate Strategy:</span>
                        <form method="POST" action="?/updateStrategy" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); notify('success', 'Strategy updated.'); }; }}>
                            <input type="hidden" name="id" value={cat.id}>
                            <select name="strategy" class="select select-bordered select-sm bg-base-100 font-medium" on:change={(e) => e.currentTarget.form?.requestSubmit()} value={cat.duplicateStrategy}>
                                <option value="PROMPT">Ask Me</option>
                                <option value="AUTO_BUMP">Auto-Merge (+1)</option>
                                <option value="AUTO_IGNORE">Auto-Ignore</option>
                            </select>
                        </form>
                    </div>

                    <button type="button" class="btn btn-ghost btn-circle text-gray-400 hover:text-error hover:bg-error/10 transition-colors" on:click={() => categoryToDelete = cat} aria-label="Delete Category">
                        <i class="bi bi-trash text-lg"></i>
                    </button>
                </div>
                <div class="sm:hidden px-4 pb-4 pt-1 flex items-center justify-between bg-base-50">
                    <span class="text-xs text-gray-500 font-semibold uppercase tracking-wider">Strategy:</span>
                    <form method="POST" action="?/updateStrategy" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); notify('success', 'Strategy updated.'); }; }}>
                        <input type="hidden" name="id" value={cat.id}>
                        <select name="strategy" class="select select-bordered select-xs bg-base-100 font-medium" on:change={(e) => e.currentTarget.form?.requestSubmit()} value={cat.duplicateStrategy}>
                            <option value="PROMPT">Ask Me</option>
                            <option value="AUTO_BUMP">Auto-Merge (+1)</option>
                            <option value="AUTO_IGNORE">Auto-Ignore</option>
                        </select>
                    </form>
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

<!-- Add Category Modal -->
<dialog bind:this={addModal} class="modal modal-bottom sm:modal-middle" on:close={() => newCategoryName = ""}>
    <div class="modal-box sm:rounded-[2rem] p-6">
        <h3 class="font-bold text-xl mb-4 text-center sm:text-left">Add Category</h3>
        <form method="POST" action="?/create" class="flex flex-col gap-6" use:enhance={() => {
            isAdding = true;
            return async ({ update, result }) => {
                await update();
                isAdding = false;
                if (result.type === 'success') {
                    addModal.close();
                    notify('success', 'Category added.');
                } else if (result.type === 'failure') {
                    notify('error', result.data?.message || 'Failed to add category.');
                }
            };
        }}>
            <input type="text" name="name" bind:value={newCategoryName} placeholder="e.g. electronics" class="input input-bordered w-full rounded-xl bg-base-50 focus:bg-base-100 transition-colors" required autocomplete="off" />
            <div class="flex flex-col sm:flex-row-reverse gap-2 sm:gap-3">
                <button type="submit" class="btn btn-primary w-full sm:w-auto flex-1 rounded-xl shadow-sm" disabled={!newCategoryName.trim() || isAdding}>
                    {#if isAdding}
                        <span class="loading loading-spinner"></span>
                    {:else}
                        Add Category
                    {/if}
                </button>
                <button type="button" class="btn btn-ghost w-full sm:w-auto flex-1 rounded-xl bg-base-200/50" on:click={() => addModal.close()} disabled={isAdding}>Cancel</button>
            </div>
        </form>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button disabled={isAdding}>close</button>
    </form>
</dialog>

<Notifications bind:notifications />
