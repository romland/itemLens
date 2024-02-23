<script>
    export let photoTypes = [];

    let addedImagesToDownload = [];

    function addImageToDownload(ev, type)
    {
        const downloadImage = window.prompt(`Link to "${type}" image:`);

        if(downloadImage) {
            document.querySelector("input[name='downloadImages']").value += type.toLowerCase() + " " + downloadImage + "\n";
            addedImagesToDownload.push({
                type: type.toLowerCase(),
                url: downloadImage
            });
            // console.log("urls now:", document.querySelector("input[name='downloadImages']").value);
            addedImagesToDownload = addedImagesToDownload;
        }
    }

</script>
<div>
    <input type="hidden" name="downloadImages" value="">

    <div class="dropdown">
        <div tabindex="0" role="button" class="btn-primary btn m-1">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
            Add image of...
        </div>
        <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box">
            {#each photoTypes as type}
                <li class="cursor-pointer" on:click={ (ev) => {
                        document?.activeElement?.blur();
                        addImageToDownload(ev, type);
                    }}>
                    <a>{type}</a>
                </li>
            {/each}
        </ul>
    </div>
</div>

<div class="mb-3">
    {#if addedImagesToDownload.length > 0}
        <span>Fetching: </span>
        {#each addedImagesToDownload as img}
            <div class="truncate max-w-96 badge badge-neutral">{img.url} ({img.type})</div>
        {/each}
    {/if}
</div>

