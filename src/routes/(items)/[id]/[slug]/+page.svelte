<script lang="ts">
    import type { PageServerData } from "./$types";
    import Delete from "$lib/components/delete.svelte";
    import Title from "$lib/components/Title.svelte";

    export let data: PageServerData;

    let productPhotos;

    function categorizePhotos()
    {
        if(data.item?.photos?.length > 0) {
            productPhotos = data.item.photos.filter((photo) => { return photo.type === "item" });
        }
    }

    categorizePhotos();
    
    if(typeof window !== 'undefined') {
        // Periodically check if we have updated data for this page.
        // I suppose using a MessageChannel or so on the Service Worker 
        // could be a future improvement? I'd have to read up on that.
        let fetchDone = true;
        setInterval(async () => {
            if(!fetchDone) {
                return;
            }

            const res = await fetch(`/api/item?id=${data.item.id}`);
            const item = await res.json();
            data.item = item;
            categorizePhotos();
            fetchDone = true;
        }, 1000);   // TODO XXX: once per second is a bit excessive, but fine for now
    }
</script>

<svelte:head>
    <Title>{data.item?.title}</Title>
</svelte:head>

<article style="padding-bottom: 100px;">
    <div class="flex justify-between items-center border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">
            {data.item?.title}
        </div>
        <div class="inline-flex gap-3">
            <a href="/{data.item?.id}/edit" title="Edit item" class="text-gray-500">
                <i class="bi bi-pencil-square"></i>
            </a>
            <Delete message='Delete this item?' action='/{data.item?.id}/delete' />
        </div>
    </div>

    <div class="flex justify-center mb-3">
        {#if productPhotos?.length > 0}
            {#if productPhotos[0].cropPath}
                <img src="{productPhotos[0].cropPath}" alt="{data.item?.title}">
            {:else}
            <img src="{productPhotos[0].orgPath}" alt="{data.item?.title}">
            {/if}
        {/if}
    </div>

    <div class="content prose max-w-none mb-3">
        {@html data.item?.contentToHtml}
    </div>

    {#if data.item?.tags}
        <div class="flex flex-wrap justify-center gap-3">
            {#each data.item?.tags as tag}
                <div class="badge badge-ghost">
                    <a href="/tag/{tag.slug}">{tag.name}</a>
                </div>
            {/each}
        </div>
    {/if}
</article>