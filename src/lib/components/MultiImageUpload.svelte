<!-- src/lib/components/MultiImageUpload.svelte -->
<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    const dispatch = createEventDispatcher();

    export let photoTypes = ["Other"];
    export let values: any[] = [];

    // To satisfy Svelte -- values is intentionally unused internally
    void values;

    let pendingPhotos: any[] = [];
    var productPhotoFileCounter = 1;

    function productPhotoUploadChanged(ev: any)
    {
        if(ev.target.files[0]) {
            const file = ev.target.files[0];
            const container = ev.target.closest('.group-container');
            const newParent = container.cloneNode(true);
            const newInput = newParent.querySelector("input[type='file']");
            const hiddenInput = newParent.querySelector("input[type='hidden']");

            // Modify the new file-select
            newInput.name = "file." + productPhotoFileCounter;
            newInput.id = newInput.name;
            newInput.value = "";

            hiddenInput.name = "file.type." + productPhotoFileCounter;
            hiddenInput.value = "";

            newInput.addEventListener("change", productPhotoUploadChanged);

            const listItems = newParent.querySelectorAll('.dropdown-content button');
            listItems.forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    hiddenInput.value = e.currentTarget.textContent.trim().toLowerCase();
                    newInput.click();
                    setTimeout(() => {
                        (document?.activeElement as HTMLElement | null)?.blur();
                    }, 50);
                });
            });

            container.classList.add("hidden");
            container.insertAdjacentElement("afterend", newParent);

            const currentPhotoIndex = productPhotoFileCounter - 1;
            productPhotoFileCounter++;

            // ----------------------------------------------------
            // Instant-On Background Upload for AI Analysis
            // ----------------------------------------------------
            const fileType = container.querySelector("input[type='hidden']").value;
            const localUrl = URL.createObjectURL(file);
            
            pendingPhotos = [...pendingPhotos, { index: currentPhotoIndex, localUrl, type: fileType, isAnalyzing: true, name: file.name }];
            dispatch('pendingChange', pendingPhotos);
            dispatch('analyzingStart', { localUrl });

            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', fileType);

            fetch('/api/analyze-draft', {
                method: 'POST',
                body: formData
            }).then(res => res.json()).then(data => {
                let finalType = fileType;
                
                if (data.success && data.draftPath) {
                    const draftInput = document.createElement('input');
                    draftInput.type = 'hidden';
                    draftInput.name = `file.draft.${currentPhotoIndex}`;
                    draftInput.value = data.draftPath;
                    container.appendChild(draftInput);
                }

                // AI Overrides Type (e.g. catches a receipt uploaded via the Hero generic button)
                if (data.success && data.aiData?.photoType) {
                    let aiType = data.aiData.photoType.toLowerCase();
                    // Match the database standard format
                    if (aiType === 'invoice') aiType = 'invoice or receipt';
                    
                    finalType = aiType;
                    const typeInput = container.querySelector("input[type='hidden']");
                    if (typeInput) typeInput.value = finalType;
                }

                pendingPhotos = pendingPhotos.map(p => p.index === currentPhotoIndex ? { ...p, isAnalyzing: false, type: finalType } : p);
                dispatch('pendingChange', pendingPhotos);
                dispatch('analyzingComplete', data);

            }).catch(err => {
                console.error("Draft analysis failed", err);
                pendingPhotos = pendingPhotos.map(p => p.index === currentPhotoIndex ? { ...p, isAnalyzing: false } : p);
                dispatch('pendingChange', pendingPhotos);
                dispatch('analyzingComplete', { error: true });
            });

            dispatch('success', `Added photo: ${file.name}`);
        }
    }

    function changeTypeManual(index: number, newType: string) {
        const input = document.querySelector(`input[name="file.type.${index}"]`) as HTMLInputElement;
        if (input) input.value = newType;
        pendingPhotos = pendingPhotos.map(p => p.index === index ? { ...p, type: newType } : p);
        dispatch('pendingChange', pendingPhotos);
    }
</script>

<div class="group-container">
    <input type="file" id="file.0" name="file.0" on:change={productPhotoUploadChanged} style="position:absolute; top:-999px;" accept="image/*" class="file-input mb-3">
    <input type="hidden" name="file.type.0" value="">

    <div class="flex justify-center w-full">
        <details class="dropdown">
            <summary class="btn btn-primary shadow-sm">
                <i class="bi bi-plus-circle mr-2"></i> Add image of...
            </summary>
        <ul class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box">
            {#each photoTypes as type}
                <li>
                    <button type="button" class="py-3 font-medium w-full text-left px-4" on:click={(ev) => {
                        const fileInputs = document.querySelectorAll('input[type="file"][name^="file."]');
                        const fileInput = fileInputs[fileInputs.length - 1] as HTMLInputElement;
                        const typeInputs = document.querySelectorAll('input[type="hidden"][name^="file.type."]');
                        const typeInput = typeInputs[typeInputs.length - 1] as HTMLInputElement;
                        
                        if (typeInput) typeInput.value = type.toLowerCase();
                        if (fileInput) fileInput.click();

                        ev.currentTarget.closest('details')?.removeAttribute('open');
                    }}>{type}</button>
                </li>
            {/each}
        </ul>
        </details>
    </div>
</div>

{#if pendingPhotos.length > 0}
    <div class="mt-8 pt-4 border-t border-base-200">
        <span class="text-sm font-semibold text-gray-500 block mb-3">Pending Uploads:</span>
        <div class="flex flex-col gap-3">
            {#each pendingPhotos as photo}
                <div class="flex items-center gap-3 bg-base-200/50 p-2 rounded-xl border border-base-200 shadow-sm relative overflow-hidden">
                    {#if photo.isAnalyzing}
                        <div class="absolute inset-0 bg-base-100/50 flex items-center justify-center z-10">
                            <span class="loading loading-spinner text-primary"></span>
                        </div>
                    {/if}
                    <div class="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-base-300">
                        <img src={photo.localUrl} alt="Preview" class="w-full h-full object-cover" />
                    </div>
                    <div class="flex flex-col flex-1 min-w-0">
                        <span class="text-sm font-semibold truncate">{photo.name}</span>
                        <select 
                            class="select select-sm select-bordered w-full max-w-[120px] mt-1 h-8 min-h-0 px-2 text-xs bg-base-100"
                            value={photo.type}
                            on:change={(e) => changeTypeManual(photo.index, e.currentTarget.value)}
                        >
                            <option value="product">Product</option>
                            <option value="invoice or receipt">Receipt</option>
                            <option value="information">Info</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>
            {/each}
        </div>
    </div>
{/if}