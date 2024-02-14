<script lang="ts">
    import type { PageServerData } from "./$types";
    import Delete from "$lib/components/delete.svelte";
    import Title from "$lib/components/Title.svelte";

    export let data: PageServerData;

    let productPhotos;

    if(data.item?.photos?.length > 0) {
        productPhotos = data.item.photos.filter((photo) => { return photo.type === "item" });
    }
</script>

<svelte:head>
    <Title>{data.item?.title}</Title>
</svelte:head>

<article style="padding-bottom: 100px;">
    <div class="flex justify-between items-center border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">{data.item?.title}</div>
        <div class="inline-flex gap-3">
            <a href="/{data.item?.id}/edit" title="Edit item" class="text-gray-500"><i class="bi bi-pencil-square"></i></a>
            <Delete message='Delete this item?' action='/{data.item?.id}/delete' />
        </div>
    </div>

    <div class="flex justify-center mb-3">
        {#if productPhotos?.length > 0}
            <img src="{productPhotos[0].cropPath}" alt="{data.item?.title}">
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