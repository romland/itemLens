<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { photoTypes } from '$lib/shared/constants';
    
    export let formId = "eltForm";
    export let forcePhotoType: string | null = null;

    export function clearQueue() {
        clipboardQueue = [];
    }

    const dispatch = createEventDispatcher();
    
    let modalOpen = false;
    let pastedType: 'image' | 'text' | 'url' | null = null;
    let pastedImageUrl: string | null = null;
    let pastedFile: File | null = null;
    let pastedText: string = "";
    let pastedUrl: string = "";

	let isDraggingOver = false;
	let dragCount = 0;
    let selectedPhotoType = photoTypes[0].toLowerCase();
$:  if (forcePhotoType) selectedPhotoType = forcePhotoType;

    let textDocumentTitle = "Pasted Note";
    let clipboardQueue: { type: string, label: string }[] = [];

    function handlePaste(event: ClipboardEvent) {
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
        
        const items = event.clipboardData?.items;
        if (!items) return;

        // Prioritize images
        for (const item of items) {
            if (item.type.startsWith("image/") || item.type === "application/pdf") {
                if (isInputFocused) event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    pastedFile = file;
                    pastedImageUrl = file.type === "application/pdf" ? null : URL.createObjectURL(file);
                    pastedType = 'image';
                    if (file.type === "application/pdf") selectedPhotoType = 'information';
                    modalOpen = true;
                }
                return;
            }
        }
        
        // Then text documents (only if focus is not in an input, to avoid breaking normal copy/paste)
        for (const item of items) {
            if (item.type === "text/plain") {
                if (!isInputFocused) {
                    item.getAsString((text) => {
                        if (isURL(text)) {
                            pastedUrl = text.trim();
                            pastedType = 'url';
                            modalOpen = true;
                        } else {
                            pastedText = text;
                            pastedType = 'text';
                            textDocumentTitle = `Note ${new Date().toLocaleString()}`;
                            modalOpen = true;
                        }
                    });
                }
                return;
            }
        }
    }

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		dragCount++;
		isDraggingOver = true;
	}
	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		dragCount--;
		if (dragCount === 0) isDraggingOver = false;
	}
	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragCount = 0;
		isDraggingOver = false;

		// Mock a clipboard event object so we can pipe drops straight into the paste logic
		if (e.dataTransfer?.files?.length) {
			const file = e.dataTransfer.files[0];
            if (file.type.startsWith("image/") || file.type === "application/pdf") {
				pastedFile = file;
                pastedImageUrl = file.type === "application/pdf" ? null : URL.createObjectURL(file);
				pastedType = 'image';
                if (file.type === "application/pdf") selectedPhotoType = 'information';
				modalOpen = true;
			} else if (file.type === "text/plain") {
				file.text().then(text => { pastedText = text; pastedType = 'text'; modalOpen = true; });
			}
		}
	}
    
    function isURL(url: string) {
        const urlRegExp = /^(?:(?:https?|ftp):\/\/)?(?:\S+(?::\S*)?@)?(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?:\/[^\s]*)?$/i;
        return urlRegExp.test(url.trim());
    }
    
    function confirmPaste() {
        const form = document.getElementById(formId) as HTMLFormElement;
        if (!form) {
             dispatch('save', { type: pastedType, file: pastedFile, photoType: selectedPhotoType, text: pastedText, url: pastedUrl, title: textDocumentTitle });
             closeModal();
             return;
        }

        if (pastedType === 'image' && pastedFile) {
            const fileInputs = form.querySelectorAll('input[type="file"][name^="file."]');
            const lastInput = fileInputs[fileInputs.length - 1] as HTMLInputElement;
            
            // Hijack the empty file input so the UI component (MultiImageUpload / Timeline) can react normally
            if (lastInput && (!lastInput.files || lastInput.files.length === 0)) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(pastedFile);
                lastInput.files = dataTransfer.files;
                
                const match = lastInput.getAttribute('name')?.match(/file\.(\d+)/);
                if (match) {
                    const typeInput = form.querySelector(`input[type="hidden"][name="file.type.${match[1]}"]`) as HTMLInputElement;
                    if (typeInput) typeInput.value = selectedPhotoType;
                }

                // Trigger standard component reaction (adds to pending queue, runs LLM draft, etc.)
                lastInput.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // Fallback (e.g. no empty input exists)
                let maxIndex = -1;
                fileInputs.forEach(input => {
                    const name = input.getAttribute('name');
                    if (name) {
                        const match = name.match(/file\.(\d+)/);
                        if (match) maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
                    }
                });
                const nextIndex = maxIndex + 1;
                
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.name = `file.${nextIndex}`;
                fileInput.style.display = 'none';
                
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(pastedFile);
                fileInput.files = dataTransfer.files;
                
                const typeInput = document.createElement('input');
                typeInput.type = 'hidden';
                typeInput.name = `file.type.${nextIndex}`;
                typeInput.value = selectedPhotoType;
                
                form.appendChild(fileInput);
                form.appendChild(typeInput);
            }

            
            clipboardQueue = [...clipboardQueue, { type: 'image', label: `Image (${selectedPhotoType})` }];
            dispatch('success', `Added pasted image (${selectedPhotoType})`);
        } else if (pastedType === 'text') {
            const taskId = Math.random().toString(36);
            const textInput = document.createElement('input');
            textInput.type = 'hidden';
            textInput.name = 'pasted_documents[]';
			textInput.id = `raw_text_${taskId}`;
            textInput.value = JSON.stringify({ title: textDocumentTitle, content: pastedText });
            form.appendChild(textInput);
            clipboardQueue = [...clipboardQueue, { type: 'text', label: `Note: ${textDocumentTitle}` }];

			dispatch('success', `Added pasted note`);
			dispatch('processingComplete', { taskId: 'instant', status: 'success', message: '' });
        } else if (pastedType === 'url') {
            const urlInput = document.createElement('input');
            urlInput.type = 'hidden';
            urlInput.name = 'pasted_urls[]';
            urlInput.value = pastedUrl;
            form.appendChild(urlInput);
            
            clipboardQueue = [...clipboardQueue, { type: 'url', label: `URL: ${pastedUrl}` }];

			dispatch('success', `Added pasted link`);
			dispatch('processingComplete', { taskId: 'instant', status: 'success', message: '' });
        }
        
        closeModal();
    }
    
    function closeModal() {
        modalOpen = false;
        pastedType = null;
        if (pastedImageUrl) {
            URL.revokeObjectURL(pastedImageUrl);
        }
        pastedImageUrl = null;
        pastedFile = null;
        pastedText = "";
        pastedUrl = "";
    }

    function handleKeydown(event: KeyboardEvent) {
        if (modalOpen) {
            if (event.key === 'Escape') {
                closeModal();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                confirmPaste();
            }
        }
    }    
</script>

<svelte:window 
	onpaste={handlePaste} 
	onkeydown={handleKeydown} 
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondragover={(e) => e.preventDefault()}
	ondrop={handleDrop}
/>

{#if isDraggingOver}
	<div class="fixed inset-0 z-[9999] bg-primary/20 backdrop-blur-sm border-8 border-primary border-dashed flex items-center justify-center pointer-events-auto transition-all animate-fade-in">
		<div class="bg-base-100/90 text-base-content px-8 py-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
			<i class="bi bi-cloud-arrow-up text-6xl text-primary"></i>
			<h2 class="text-3xl font-bold tracking-tight">Drop files to attach</h2>
		</div>
	</div>
{/if}

    {#if clipboardQueue.length > 0}
        <div class="alert alert-info shadow-sm mb-4 flex flex-col items-start gap-2">
            <div class="font-bold">Queued from Clipboard ({clipboardQueue.length})</div>
            <div class="flex flex-wrap gap-2 w-full">
                {#each clipboardQueue as item}
                    <div class="badge badge-outline bg-base-100 gap-1 p-3 truncate max-w-full">
                        {#if item.type === 'image'}<i class="bi bi-image"></i>
                        {:else if item.type === 'text'}<i class="bi bi-file-text"></i>
                        {:else}<i class="bi bi-link-45deg"></i>{/if}
                        {item.label}
                    </div>
                {/each}
            </div>
        </div>
    {/if}


<dialog class="modal" class:modal-open={modalOpen}>
    <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Paste Detected</h3>
        
        {#if pastedType === 'image'}
            <div class="mb-4">
                {#if pastedFile?.type === 'application/pdf'}
                    <div class="flex items-center justify-center p-8 bg-base-200 rounded-xl border border-base-300 shadow-inner">
                        <i class="bi bi-file-earmark-pdf text-6xl text-error"></i>
                        <span class="ml-4 font-bold text-lg break-all">{pastedFile.name}</span>
                    </div>
                {:else}
                    <img src={pastedImageUrl} alt="Pasted" class="max-h-64 rounded-lg object-contain mx-auto border border-base-300" />
                {/if}
            </div>
            {#if !forcePhotoType}
                <div class="form-control w-full">
                    <div class="label"><span class="label-text font-semibold">What type of image is this?</span></div>
                    <select bind:value={selectedPhotoType} class="select select-bordered w-full">
                        {#each photoTypes as type}
                            <option value={type.toLowerCase()}>{type}</option>
                        {/each}
                    </select>
                </div>
            {/if}
        {:else if pastedType === 'url'}
            <div class="alert alert-success border-none shadow-sm mb-4">
                <i class="bi bi-link-45deg text-2xl"></i>
                <div>
                    <h3 class="font-bold">Link Detected</h3>
                    <div class="text-xs break-all mt-1">{pastedUrl}</div>
                </div>
            </div>
            <p class="text-sm">Do you want to fetch and save this document when you submit the form?</p>            
        {:else if pastedType === 'text'}
            <div class="form-control w-full mb-4">
                <div class="label"><span class="label-text font-semibold">Note Title</span></div>
                <input type="text" bind:value={textDocumentTitle} class="input input-bordered w-full" />
            </div>
            <div class="mb-4">
                <div class="label"><span class="label-text font-semibold">Content</span></div>
                <pre class="bg-base-200 p-3 rounded w-full text-xs overflow-x-auto max-h-48 whitespace-pre-wrap">{pastedText}</pre>
            </div>
        {/if}
        
        <div class="modal-action">
            <button type="button" class="btn" on:click={closeModal}>Cancel</button>
            <button type="button" class="btn btn-primary" on:click={confirmPaste}>Add</button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button on:click={closeModal}>close</button>
    </form>
</dialog>