<script>
    import RefreshDeleteList from "$lib/components/RefreshDeleteList.svelte";

    import { createEventDispatcher } from 'svelte'
    const dispatch = createEventDispatcher();

    export let photoTypes = ["Other"];
    export let values = [];

    let addedPhotoFilenames = []
    var productPhotoFileCounter = 1;

    // This is very un-Svelte; I had trouble getting something Svelte-ish
    // working on my old iPhone.
    function productPhotoUploadChanged(ev)
    {
        if(ev.target.files[0]) {
            // Take parent of file-select, clone it and make a new element
            // for further file-uploads. One could argue that one should use
            // multi-select, but that's not handy when camera is the source of
            // the file.
            const container = ev.target.parentNode;
            const newParent = container.cloneNode(true);
            const newInput = newParent.getElementsByTagName("input")[0];

            // Modify the new file-select
            newInput.name = "file." + productPhotoFileCounter;
            newInput.id = newInput.name;
            newInput.value = "";

            // Add event: Make sure new file-select also calls in here when changed
            newInput.addEventListener("change", productPhotoUploadChanged);

            // Loop through each <li> element and add a click event listener
            const listItems = newParent.querySelectorAll('li');
            listItems.forEach((item) => {
                // Make sure we make a copy of the original as it might increase.
                const prodPhotoId = productPhotoFileCounter;
                item.addEventListener('click', (ev) => {
                    newParent.querySelector(`input[type='file']`)?.click();
                    document?.activeElement?.blur();

                    // Set name and avalue of the hidden input for type of file (product, receipt, ...)
                    const photoTypeElt = ev.target.parentNode.parentNode.parentNode.parentNode.querySelector("input[type='hidden']");
                    photoTypeElt.name = "file.type." + prodPhotoId;
                    photoTypeElt.value = ev.target.text.toLowerCase();
                });
            });

            // Hide the original
            container.classList.add("hidden");

            // Insert the new element after the previous
            container.insertAdjacentElement("afterend", newParent);

            productPhotoFileCounter++;

            addedPhotoFilenames.push({
                type: container.querySelector("input[type='hidden']").value,
                name: ev.target.files[0].name
            });
            addedPhotoFilenames = addedPhotoFilenames;
            
            dispatch('success', `Added photo: ${ev.target.files[0].name}`);
        }
    }

    let refreshPhoto = [];
    function toggleRefreshAllImages(ev)
    {
        refreshPhoto = [];
        if(ev.target.checked) {
            for(let i = 0; i < values.length; i++) {
                const photo = values[i]
                refreshPhoto.push(photo.id);
            }
            refreshPhoto = refreshPhoto;
        }
    }

    function toggleRefresh(ev)
    {
        const photoId = parseInt(ev.target.name.split(".")[1]);
        if(refreshPhoto.includes(photoId)) {
            refreshPhoto.splice(refreshPhoto.indexOf(photoId), 1);
        } else {
            refreshPhoto.push(photoId);
        }
        refreshPhoto = refreshPhoto;
    }

    let deletePhoto = [];
    function toggleDeleteAllImages(ev)
    {
        deletePhoto = [];
        if(ev.target.checked) {
            for(let i = 0; i < values.length; i++) {
                const photo = values[i]
                deletePhoto.push(photo.id);
            }
            deletePhoto = deletePhoto;
        }
    }

    function toggleDelete(ev)
    {
        const photoId = parseInt(ev.target.name.split(".")[1]);
        if(deletePhoto.includes(photoId)) {
            deletePhoto.splice(deletePhoto.indexOf(photoId), 1);
        } else {
            deletePhoto.push(photoId);
        }
        deletePhoto = deletePhoto;
    }

</script>

{#if values.length > 0}
    <RefreshDeleteList
        values={values}
        inputName="images"
        columns={{
            "3":{name:"Image",    fieldName:"orgPath", isImage: true},
            "4":{name:"Filename", fieldName:"orgPath", prefix:"type", isLink: true}
        }}
    />
{/if}


<div>
    <input type="file" id="file.0" name="file.0" on:change={productPhotoUploadChanged} style="position:absolute; top:-999px;" accept="image/*" capture="environment" class="file-input mb-3">
    <input type="hidden" name="file.type.0" value="">

    <div class="dropdown">
        <div tabindex="0" role="button" class="btn-primary btn m-1">
            Add photo of...
        </div>
        <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box">
            {#each photoTypes as type}
                <li class="cursor-pointer" on:click={ (ev) => {
                        document?.getElementById('file.0')?.click();
                        document?.activeElement?.blur();
                        ev.target.parentNode.parentNode.parentNode.parentNode.querySelector("input[type='hidden']").value = ev.target.text.toLowerCase();
                    }}>
                    <a>{type}</a>
                </li>
            {/each}
        </ul>
    </div>
</div>

{#if addedPhotoFilenames.length > 0}
    <span>Uploading: </span>
    {#each addedPhotoFilenames as photo}
        <div class="truncate max-w-96 badge badge-neutral">{photo.name} ({photo.type})</div>
    {/each}
{/if}
