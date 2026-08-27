<script lang="ts">
    import TimelineInput from '$lib/components/timeline/TimelineInput.svelte';
    import TimelineCard from '$lib/components/timeline/TimelineCard.svelte';
    import pageTitle from '$lib/stores';
    import PasteHandler from "$lib/components/PasteHandler.svelte";
    import Notifications from "$lib/components/Notifications.svelte";
	import ImageLightbox from "$lib/components/ImageLightbox.svelte";
	import DocumentLightbox from "$lib/components/DocumentLightbox.svelte";
    import { onMount, onDestroy } from 'svelte';

    export let data;

    pageTitle.set("Notebook");

    let pasteKey = 0;
    let pasteHandler: any;

    let notifications: any[] = [];
    function notify(status: string, message: string, id: string | null = null) {
        if (id) {
            const existingIndex = notifications.findIndex(n => n.id === id);
            if (existingIndex !== -1) {
                notifications[existingIndex] = { ...notifications[existingIndex], status, message };
                notifications = [...notifications];
                if (status !== 'loading') setTimeout(() => notifications = notifications.filter(n => n.id !== id), 3000);
                return id;
            }
        }
        const newId = id || Math.random().toString(36);
        notifications = [...notifications, { id: newId, status, message }];
        if (status !== 'loading') setTimeout(() => notifications = notifications.filter(n => n.id !== newId), 3000);
        return newId;
    }    

    let displayLimit = 10;
    let observer: IntersectionObserver;
	let imgLightbox: ImageLightbox;
	let docLightbox: DocumentLightbox;

    onMount(() => {
        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                displayLimit += 10;
            }
        }, { rootMargin: '500px' });
        
        setTimeout(() => {
            const el = document.getElementById('timeline-load-more');
            if (el) observer.observe(el);
        }, 100);
    });

    onDestroy(() => {
        if (observer) observer.disconnect();
    });

    $: displayedNotes = data.notes ? data.notes.slice(0, displayLimit) : [];
</script>

<PasteHandler 
    bind:this={pasteHandler}
    formId="timelineForm" 
    on:success={(ev) => {
        notify("success", ev.detail);
        setTimeout(() => (document.getElementById('timelineForm') as HTMLFormElement)?.requestSubmit(), 50);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }} 
    on:processingStart={(ev) => notify("loading", ev.detail.message, ev.detail.taskId)}
    on:processingComplete={(ev) => {
        if (ev.detail.message) notify(ev.detail.status, ev.detail.message, ev.detail.taskId);
    }}
/>

<div class="flex flex-col h-full max-w-2xl mx-auto pb-32 box-border overflow-x-hidden">
    <div class="flex justify-start sm:justify-center pt-4 px-2 w-full overflow-hidden">
        <div class="tabs tabs-boxed bg-base-200/50 flex-nowrap overflow-x-auto hide-scrollbar w-full sm:w-auto">
            <a href="/timeline?category=all" class="tab whitespace-nowrap {data.currentCategory === 'all' ? 'tab-active' : ''}">All</a>
            <a href="/timeline?category=idea" class="tab whitespace-nowrap {data.currentCategory === 'idea' ? 'tab-active' : ''}">Ideas</a>
            <a href="/timeline?category=todo" class="tab whitespace-nowrap {data.currentCategory === 'todo' ? 'tab-active' : ''}">To Do</a>
            <a href="/timeline?category=to buy" class="tab whitespace-nowrap {data.currentCategory === 'to buy' ? 'tab-active' : ''}">To Buy</a>
            <a href="/timeline?category=to read" class="tab whitespace-nowrap {data.currentCategory === 'to read' ? 'tab-active' : ''}">To Read</a>
            <a href="/timeline?category=other" class="tab whitespace-nowrap {data.currentCategory === 'other' ? 'tab-active' : ''}">Other</a>
            <a href="/timeline?category=archive" class="tab whitespace-nowrap {data.currentCategory === 'archive' ? 'tab-active' : ''}">Archive</a>
        </div>
    </div>

    <div class="flex-1 overflow-y-auto flex flex-col gap-4 py-4 px-2 w-full box-border">
        {#each displayedNotes as note (note.id)}
			<TimelineCard 
				{note} 
				on:openImage={(e) => imgLightbox.open(e.detail)} 
				on:openDoc={(e) => docLightbox.open(e.detail)} 
			/>
        {:else}
            <div class="text-center text-gray-400 mt-10">
                <i class="bi bi-chat-square-text text-4xl"></i>
                <p class="mt-4">Your notebook is empty.<br><br>
                    Start dumping ideas, TODOs, shopping lists, pictures, links below!<br><br>
                    You can also just <i>paste</i> (ctrl+v) things in on this page.
                </p>
            </div>
        {/each}
        {#if data.notes && displayLimit < data.notes.length}
            <div id="timeline-load-more" class="h-10 w-full flex justify-center items-center text-gray-400"><span class="loading loading-spinner loading-sm"></span></div>
        {/if}
    </div>
</div>

<!-- Fixed Input Bar Component -->
<TimelineInput on:posted={() => { pasteHandler?.clearQueue(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />

<Notifications bind:notifications />

<ImageLightbox bind:this={imgLightbox} itemTitle="Note Attachment" />
<DocumentLightbox bind:this={docLightbox} />
