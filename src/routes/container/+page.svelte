<script lang="ts">
    import type { PageServerData } from "./$types";
    import { enhance } from "$app/forms";
    import { slide } from 'svelte/transition';
    import Notifications from "$lib/components/Notifications.svelte";

    export let data: PageServerData;
    import pageTitle from '$lib/stores';
    pageTitle.set("Containers");

    let searchQuery = "";
    $: filteredContainers = data.containers.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (c.location && c.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    let containerToDelete: any = null;
    let confirmModal: HTMLDialogElement;
    let isDeleting = false;
    let notifications: any[] = [];

    $: if (confirmModal) {
        if (containerToDelete && !confirmModal.open) confirmModal.showModal();
        if (!containerToDelete && confirmModal.open) confirmModal.close();
    }

    function notify(status: string, message: string) {
        const id = Math.random().toString(36);
        notifications = [...notifications, { id, status, message }];
        setTimeout(() => notifications = notifications.filter(n => n.id !== id), 3000);
    }    
</script>

<div class="max-w-2xl mx-auto pt-4 pb-20 px-4 sm:px-0">
    <div class="flex items-center justify-between mb-6">
        <h1 class="text-3xl font-bold tracking-tight">Containers</h1>
        <a href="/container/add" class="btn btn-circle btn-primary shadow-sm">
            <i class="bi bi-plus-lg text-xl"></i>
        </a>
    </div>

    <!-- Search Bar -->
    <div class="bg-base-200/50 rounded-xl p-2 flex items-center gap-2 mb-6 border border-base-200 shadow-inner">
        <i class="bi bi-search text-gray-400 ml-2"></i>
        <input type="text" bind:value={searchQuery} placeholder="Search containers, locations..." class="bg-transparent border-none focus:outline-none w-full text-base" />
        {#if searchQuery}
            <button class="btn btn-ghost btn-circle btn-xs mr-1" on:click={() => searchQuery = ""}><i class="bi bi-x-circle-fill text-gray-400"></i></button>
        {/if}
    </div>

    <!-- Inset Grouped List -->
    <div class="bg-base-100 rounded-[1.5rem] border border-base-200 shadow-sm overflow-hidden">
        <div class="flex flex-col divide-y divide-base-200">
            {#each filteredContainers as cont (cont.name)}
                <div class="flex items-center justify-between p-3 sm:p-4 hover:bg-base-50 transition-colors" transition:slide|local={{ duration: 250 }}>
                    <a href="/container/{cont.name}/edit" class="flex items-center gap-4 flex-1 min-w-0">
                        <div class="w-12 h-12 rounded-xl bg-base-200 overflow-hidden shrink-0 border border-base-300 flex items-center justify-center">
                            {#if cont.photoPath}
                                <img class="w-full h-full object-cover" src="{cont.photoPath}" alt="{cont.name}"/>
                            {:else}
                                <i class="bi bi-box-seam text-gray-400 text-xl"></i>
                            {/if}
                        </div>
                        <div class="flex-1 min-w-0 pr-2">
                            <div class="font-semibold text-lg tracking-tight flex items-center gap-2">
                                {cont.name}
                                {#if cont.children.length > 0}
                                    <span class="badge badge-sm badge-ghost text-[10px] uppercase">{cont.children.length} Trays</span>
                                {/if}
                            </div>
                            <div class="text-xs text-gray-500 truncate flex gap-2">
                                {#if cont.location}<span class="text-primary"><i class="bi bi-geo-alt-fill"></i> {cont.location}</span>{/if}
                                {#if cont.description}<span class="truncate">{cont.description}</span>{/if}
                            </div>
                        </div>
                    </a>
                    <button type="button" class="btn btn-ghost btn-circle shrink-0 text-gray-400 hover:text-error hover:bg-error/10 transition-colors" on:click={() => containerToDelete = cont} aria-label="Delete Container">
                        <i class="bi bi-trash text-lg"></i>
                    </button>
                </div>
            {:else}
                <div class="p-8 text-center text-gray-400 flex flex-col items-center gap-3">
                    <div class="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center">
                        <i class="bi bi-inboxes text-2xl opacity-50"></i>
                    </div>
                    <span class="font-medium">No containers found.</span>
                </div>
            {/each}
        </div>
    </div>
</div>

<!-- Action Sheet Modal -->
<dialog bind:this={confirmModal} class="modal modal-bottom sm:modal-middle" on:close={() => containerToDelete = null}>
    <div class="modal-box sm:rounded-[2rem] p-6">
        <h3 class="font-bold text-xl mb-2 text-center sm:text-left">Delete Container?</h3>
        <p class="text-gray-500 text-center sm:text-left text-sm mb-6">
            Are you sure you want to delete <strong class="text-base-content">"{containerToDelete?.name}"</strong>? 
            <br><br>
            This action cannot be undone. Items assigned to this container will lose their location tag.
        </p>
        <div class="flex flex-col sm:flex-row-reverse gap-2 sm:gap-3">
            <form method="POST" action="?/delete" class="w-full sm:w-auto flex-1" use:enhance={() => {
                isDeleting = true;
                return async ({ update }) => {
                    await update();
                    isDeleting = false;
                    containerToDelete = null;
                    notify('success', 'Container deleted successfully.');
                };
            }}>
                <input type="hidden" name="name" value={containerToDelete?.name}>
                <button type="submit" class="btn btn-error w-full text-white shadow-sm rounded-xl" disabled={isDeleting}>
                    {#if isDeleting}
                        <span class="loading loading-spinner"></span>
                    {:else}
                        Delete Container
                    {/if}
                </button>
            </form>
            <button class="btn btn-ghost w-full sm:w-auto flex-1 rounded-xl bg-base-200/50" on:click={() => containerToDelete = null} disabled={isDeleting}>Cancel</button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button disabled={isDeleting}>close</button>
    </form>
</dialog>

<Notifications bind:notifications />
