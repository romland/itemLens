<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { photoTypes } from '$lib/shared/constants';
    
    export let formId = "eltForm";
    
    const dispatch = createEventDispatcher();
    
    let modalOpen = false;
    let pastedType: 'image' | 'text' | 'url' | null = null;
    let pastedImageUrl: string | null = null;
    let pastedFile: File | null = null;
    let pastedText: string = "";
    let pastedUrl: string = "";

    let selectedPhotoType = photoTypes[0].toLowerCase();
    let textDocumentTitle = "Pasted Note";
    let clipboardQueue: { type: string, label: string }[] = [];

    function handlePaste(event: ClipboardEvent) {
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
        
        const items = event.clipboardData?.items;
        if (!items) return;

        // Prioritize images
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                if (isInputFocused) event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    pastedFile = file;
                    pastedImageUrl = URL.createObjectURL(file);
                    pastedType = 'image';
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
            let maxIndex = -1;
            const fileInputs = form.querySelectorAll('input[type="file"][name^="file."]');
            fileInputs.forEach(input => {
                const name = input.getAttribute('name');
                if (name) {
                    const match = name.match(/file\.(\d+)/);
                    if (match) {
                        maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
                    }
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
            
            clipboardQueue = [...clipboardQueue, { type: 'image', label: `Image (${selectedPhotoType})` }];
            dispatch('success', `Added pasted image (${selectedPhotoType})`);
        } else if (pastedType === 'text') {
            const textInput = document.createElement('input');
            textInput.type = 'hidden';
            textInput.name = 'pasted_documents[]';
			textInput.id = `raw_text_${taskId}`;
            textInput.value = JSON.stringify({ title: textDocumentTitle, content: pastedText });
            form.appendChild(textInput);
            clipboardQueue = [...clipboardQueue, { type: 'text', label: `Note: ${textDocumentTitle}` }];

            // Background Process
			const taskId = Math.random().toString(36);
			dispatch('processingStart', { taskId, message: "Analyzing note..." });
			fetch('/api/analyze-draft-document', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'text', payload: pastedText })
			}).then(r => r.json()).then(data => {
				if (data.success) {
					document.getElementById(`raw_text_${taskId}`)?.remove();
					const preInput = document.createElement('input');
					preInput.type = 'hidden';
					preInput.name = 'preprocessed_docs[]';
					preInput.value = JSON.stringify({ ...data, type: 'text' });
					form.appendChild(preInput);
					dispatch('processingComplete', { taskId, status: 'success', message: "Note analyzed!" });
				} else {
					dispatch('processingComplete', { taskId, status: 'error', message: "Failed to analyze note." });
				}
			}).catch(() => {
				dispatch('processingComplete', { taskId, status: 'error', message: "Failed to analyze note." });
			});
        } else if (pastedType === 'url') {
            // Background Process
			const taskId = Math.random().toString(36);

            const urlInput = document.createElement('input');
            urlInput.type = 'hidden';
            urlInput.name = 'pasted_urls[]';
			urlInput.id = `raw_url_${taskId}`;
            urlInput.value = pastedUrl;
            form.appendChild(urlInput);
            
            clipboardQueue = [...clipboardQueue, { type: 'url', label: `URL: ${pastedUrl}` }];

			dispatch('processingStart', { taskId, message: "Fetching link..." });
			fetch('/api/analyze-draft-document', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'url', payload: pastedUrl })
			}).then(r => r.json()).then(data => {
				if (data.success) {
					document.getElementById(`raw_url_${taskId}`)?.remove();
					const preInput = document.createElement('input');
					preInput.type = 'hidden';
					preInput.name = 'preprocessed_docs[]';
					preInput.value = JSON.stringify({ ...data, type: 'url' });
					form.appendChild(preInput);
					dispatch('processingComplete', { taskId, status: 'success', message: "Link indexed!" });
				} else {
					dispatch('processingComplete', { taskId, status: 'error', message: "Failed to fetch link." });
				}
			}).catch(() => {
				dispatch('processingComplete', { taskId, status: 'error', message: "Failed to fetch link." });
			});
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
        if (modalOpen && event.key === 'Escape') {
            closeModal();
        }
    }    
</script>

    <svelte:window onpaste={handlePaste} onkeydown={handleKeydown} />

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
                <img src={pastedImageUrl} alt="Pasted" class="max-h-64 rounded-lg object-contain mx-auto border border-base-300" />
            </div>
            <div class="form-control w-full">
                <div class="label"><span class="label-text font-semibold">What type of image is this?</span></div>
                <select bind:value={selectedPhotoType} class="select select-bordered w-full">
                    {#each photoTypes as type}
                        <option value={type.toLowerCase()}>{type}</option>
                    {/each}
                </select>
            </div>
        {:else if pastedType === 'url'}
            <div class="alert alert-success bg-emerald-100 text-emerald-900 border-none shadow-sm mb-4">
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