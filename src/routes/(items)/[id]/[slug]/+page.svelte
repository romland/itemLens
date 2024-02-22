<script lang="ts">
    import type { PageServerData } from "./$types";
    import Delete from "$lib/components/delete.svelte";
    import Title from "$lib/components/Title.svelte";
    import { refine, refineForLLM } from "$lib/shared/ocrparser";


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

    console.log("data.item:", data.item);
</script>

<svelte:head>
    <Title>{data.item?.title}</Title>
</svelte:head>

<article style="padding-bottom: 100px;" class="">

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


    {#if productPhotos?.length > 0}
        <div class="carousel carousel-center max-w-md p-4 space-x-4 bg-neutral rounded-box max-h-80" style="background: linear-gradient(109.6deg, rgb(20, 30, 48) 11.2%, rgb(36, 59, 85) 91.1%);">
            {#each productPhotos as photo, i}
                <div id="carousel-item{i}" class="carousel-item w-full justify-center">
                    {#if productPhotos[i].cropPath}
                        <img src="{productPhotos[i].cropPath}" class="">
                    {:else}
                        <img src="{productPhotos[i].orgPath}" alt="{data.item?.title}" class="">
                    {/if}
                </div> 
            {/each}
        </div>

        <div class="flex justify-center w-full py-2 gap-2">
            {#each productPhotos as photo, i}
                <button on:click={()=> { document.getElementById("carousel-item" + i).scrollIntoView({ block: 'nearest', inline: 'center' }) }} class="btn btn-xs">
                    {i+1}
                </button> 
            {/each}
        </div>
    {/if}
<!--
    <div class="flex justify-center mb-3">
        {#if productPhotos?.length > 0}
            {#if productPhotos[0].cropPath}
                <img src="{productPhotos[0].cropPath}" alt="{data.item?.title}">
            {:else}
                <img src="{productPhotos[0].orgPath}" alt="{data.item?.title}">
            {/if}
        {/if}
    </div>
-->
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



<div class="overflow-x-auto">
  <table class="table">
    <!-- head -->
    <thead>
      <tr>
        <th>Name</th>
        <th>Job</th>
        <th>Favorite Color</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <!-- row 1 -->
      <tr>
        <td>
          <div class="flex items-center gap-3">
            <div class="avatar">
              <div class="mask mask-squircle w-12 h-12">
                <img src="/tailwind-css-component-profile-2@56w.png" alt="Avatar Tailwind CSS Component" />
              </div>
            </div>
            <div>
              <div class="font-bold">Hart Hagerty</div>
              <div class="text-sm opacity-50">United States</div>
            </div>
          </div>
        </td>
        <td>
          Zemlak, Daniel and Leannon
          <br/>
          <span class="badge badge-ghost badge-sm">Desktop Support Technician</span>
        </td>
        <td>Purple</td>
        <th>
          <button class="btn btn-ghost btn-xs">details</button>
        </th>
      </tr>
    </tbody>
  </table>
</div>

</article>