<script lang="ts">
    import type { PageServerData } from "./$types";
    import Delete from "$lib/components/delete.svelte";

    export let data: PageServerData;

    import pageTitle from '$lib/stores';
    pageTitle.set("Container " + data.item?.name);
</script>

<article style="padding-bottom: 100px;" class="">

    <div class="flex justify-between items-center border-b border-base-300 pb-3 mb-3">
        <div class="title font-bold">
            {$pageTitle}
        </div>
        <div class="inline-flex gap-3">
            <a href="/container/{data.item?.name}/edit" title="Edit item" class="text-gray-500">
                <i class="bi bi-pencil-square"></i>
            </a>
            <Delete message='Delete this item?' action='/container/{data.item?.name}/delete' />
        </div>
    </div>

    <div class="flex flex-col md:flex-row w-full space-x-4">
        <div class="basis-4/5 pl-2">
            <img src="{data.item?.photoPath}" alt="{data.item?.name}" class="">
        </div>
    
        <div class="mb-3 text-sm">
<pre>
Name: {data.item?.name}
Number of trays: {data.item?.children?.length}
Description: {data.item?.description}
Location: {data.item?.location}
Photo: {data.item?.photoPath}
</pre>
        </div>
    </div>
    
</article>
