<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { photoTypes } from '$lib/shared/constants';
    import Modal from './Modal.svelte';
    import FormInput from './FormInput.svelte';
    import FormSelect from './FormSelect.svelte';
    
    export let formId = "eltForm";
    export let forcePhotoType: string | null = null;

    export function clearQueue() {
        clipboardQueue = [];
        const form = document.getElementById(formId);
        if (form) {
            form.querySelectorAll('.paste-handler-input').forEach(el => el.remove());
        }
    }

    const dispatch = createEventDispatcher();
    
    let pasteModal: Modal;
    let pastedType: 'image' | 'text' | 'url' | 'document' | null = null;
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

    function processFile(file: File, isInputFocused: boolean, event: Event): boolean {
        console.log(`[PasteHandler] Processing file: name="${file.name}", type="${file.type}", size=${file.size} bytes`);
        
        if (file.type.startsWith("image/")) {
            if (isInputFocused) event.preventDefault();
            pastedFile = file;
            pastedImageUrl = URL.createObjectURL(file);
            pastedType = 'image';
            pasteModal.showModal();
            return true;
        } else if (file.type === "text/plain" || file.name.toLowerCase().endsWith('.txt')) {
            if (!isInputFocused) {
                file.text().then(text => { pastedText = text; pastedType = 'text'; textDocumentTitle = file.name || "Pasted Note"; pasteModal.showModal(); });
                return true;
            }
        } else {
            // Catch-all for any other file type (PDF, EPUB, DOCX, ZIP, Firmware BIN, etc.)
            if (isInputFocused) event.preventDefault();
            pastedFile = file;
            pastedType = 'document';
            textDocumentTitle = file.name || "Uploaded File";
            pasteModal.showModal();
            return true;
        }
        return false;
    }

    function handlePaste(event: ClipboardEvent) {
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
        
        const items = event.clipboardData?.items;
        if (!items) return;

        console.log("[PasteHandler] Paste event items:", Array.from(items).map(i => ({kind: i.kind, type: i.type})));

        // Prioritize files
        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file && processFile(file, !!isInputFocused, event)) return;
            }
        }
        
        // Then string content
        for (const item of items) {
            if (item.kind === "string" && item.type === "text/plain") {
                if (!isInputFocused) {
                    item.getAsString((text) => {
                        if (isURL(text)) {
                            pastedUrl = text.trim();
                            pastedType = 'url';
                            pasteModal.showModal();
                        } else {
                            pastedText = text;
                            pastedType = 'text';
                            textDocumentTitle = `Note ${new Date().toLocaleString()}`;
                            pasteModal.showModal();
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

        console.log("[PasteHandler] Drop event received", e);

		if (e.dataTransfer?.files?.length) {
			const file = e.dataTransfer.files[0];
            processFile(file, false, e);
		} else {
            console.log("[PasteHandler] Drop event contained no files.");
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
                fileInput.classList.add('paste-handler-input');
                
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(pastedFile);
                fileInput.files = dataTransfer.files;
                
                const typeInput = document.createElement('input');
                typeInput.type = 'hidden';
                typeInput.name = `file.type.${nextIndex}`;
                typeInput.value = selectedPhotoType;
                typeInput.classList.add('paste-handler-input');
                
                form.appendChild(fileInput);
                form.appendChild(typeInput);
            }

            
            clipboardQueue = [...clipboardQueue, { type: 'image', label: `Image (${selectedPhotoType})` }];
            dispatch('success', `Added pasted image (${selectedPhotoType})`);
            dispatch('processingComplete', { taskId: 'instant', status: 'success', message: '' });
        } else if (pastedType === 'document' && pastedFile) {
            const taskId = Math.random().toString(36).substring(2);
            
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.name = `uploaded_document_file.${taskId}`;
            fileInput.style.display = 'none';
            fileInput.classList.add('paste-handler-input');
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(pastedFile);
            fileInput.files = dataTransfer.files;
            
            const titleInput = document.createElement('input');
            titleInput.type = 'hidden';
            titleInput.name = `uploaded_document_title.${taskId}`;
            titleInput.value = textDocumentTitle;
            titleInput.classList.add('paste-handler-input');
            
            form.appendChild(fileInput);
            form.appendChild(titleInput);
            
            clipboardQueue = [...clipboardQueue, { type: 'document', label: `Doc: ${textDocumentTitle}` }];
            dispatch('success', `Added pasted document`);
            dispatch('processingComplete', { taskId: 'instant', status: 'success', message: '' });
        } else if (pastedType === 'text') {
            const taskId = Math.random().toString(36).substring(2);
            const textInput = document.createElement('input');
            textInput.type = 'hidden';
            textInput.name = 'pasted_documents[]';
			textInput.id = `raw_text_${taskId}`;
            textInput.value = JSON.stringify({ title: textDocumentTitle, content: pastedText });
            textInput.classList.add('paste-handler-input');
            form.appendChild(textInput);
            clipboardQueue = [...clipboardQueue, { type: 'text', label: `Note: ${textDocumentTitle}` }];

			dispatch('success', `Added pasted note`);
			dispatch('processingComplete', { taskId: 'instant', status: 'success', message: '' });
        } else if (pastedType === 'url') {
            const urlInput = document.createElement('input');
            urlInput.type = 'hidden';
            urlInput.name = 'pasted_urls[]';
            urlInput.value = pastedUrl;
            urlInput.classList.add('paste-handler-input');
            form.appendChild(urlInput);
            
            clipboardQueue = [...clipboardQueue, { type: 'url', label: `URL: ${pastedUrl}` }];

			dispatch('success', `Added pasted link`);
			dispatch('processingComplete', { taskId: 'instant', status: 'success', message: '' });
        }
        
        closeModal();
    }
    
    function closeModal() {
        pasteModal?.close();
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
        // The modal handles Escape naturally, but we can capture Enter
        if (pastedType && event.key === 'Enter') {
            event.preventDefault();
            confirmPaste();
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
                        {:else if item.type === 'document'}<i class="bi bi-file-earmark"></i>
                        {:else}<i class="bi bi-link-45deg"></i>{/if}
                        {item.label}
                    </div>
                {/each}
            </div>
        </div>
    {/if}


<Modal bind:this={pasteModal} title="Paste Detected" on:close={closeModal}>
        {#if pastedType === 'image'}
            <div class="mb-4">
                    <img src={pastedImageUrl} alt="Pasted" class="max-h-64 rounded-lg object-contain mx-auto border border-base-300" />
            </div>
            {#if !forcePhotoType}
                <FormSelect label="What type of image is this?" bind:value={selectedPhotoType}>
                    {#each photoTypes as type}
                        <option value={type.toLowerCase()}>{type}</option>
                    {/each}
                </FormSelect>
            {/if}
        {:else if pastedType === 'document'}
            <div class="mb-4 flex flex-col items-center justify-center p-8 bg-base-200 rounded-xl border border-base-300 shadow-inner">
                {#if pastedFile?.name.toLowerCase().endsWith('.pdf')}
                    <i class="bi bi-file-earmark-pdf text-6xl text-error"></i>
                {:else}
                    <i class="bi bi-file-earmark-arrow-up text-6xl text-primary"></i>
                {/if}
                <span class="mt-4 font-bold text-lg break-all">{pastedFile?.name}</span>
            </div>
            <FormInput label="Document Title" bind:value={textDocumentTitle} class="mb-4" />
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
            <FormInput label="Note Title" bind:value={textDocumentTitle} class="mb-4" />
            <div class="mb-4">
                <div class="label"><span class="label-text font-semibold">Content</span></div>
                <pre class="bg-base-200 p-3 rounded w-full text-xs overflow-x-auto max-h-48 whitespace-pre-wrap">{pastedText}</pre>
            </div>
        {/if}
        
        <div class="modal-action">
            <button type="button" class="btn" on:click={closeModal}>Cancel</button>
            <button type="button" class="btn btn-primary" on:click={confirmPaste}>Add</button>
        </div>
</Modal>
