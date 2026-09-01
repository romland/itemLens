<script lang="ts">
    /*
     * Reason for having searching in here (as well) is that it is 
     * that 'search-as-you-type' is tied to the input field.
     */
    import Items from "$lib/components/items.svelte";
    import DropdownPanel from "$lib/components/DropdownPanel.svelte";
	import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    export let q: string = '';
    let resultsAsYouType: HTMLDivElement;

    let items = [];
    let selectedIndex = -1;
	
	$: userPrefs = (() => { try { return JSON.parse($page.data.user?.preferences || '{}'); } catch(e) { return {}; } })();
	$: enableVoiceSearch = userPrefs.enableVoiceSearch === true;

	let isListening = false;
	let isProcessingAudio = false;
	let mediaRecorder: MediaRecorder | null = null;
	let audioChunks: Blob[] = [];
	let audioContext: any = null;
	let silenceAnimFrame: number;
	let voiceError = '';

	function showVoiceError(msg: string) {
		voiceError = msg;
		setTimeout(() => voiceError = '', 4000);
	}

	async function startVoiceSearch() {
		try {
			// Safari PWA Hack: Unlock SpeechSynthesis audio context synchronously on user interaction
			if ('speechSynthesis' in window) {
				const silentUtterance = new SpeechSynthesisUtterance('');
				silentUtterance.volume = 0;
				window.speechSynthesis.speak(silentUtterance);
			}

			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder = new MediaRecorder(stream);
			audioChunks = [];

			// Setup Audio Analyzer for Automatic Silence Detection
			const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
			audioContext = new AudioContextClass();
			const source = audioContext.createMediaStreamSource(stream);
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);
			const dataArray = new Uint8Array(analyser.frequencyBinCount);
			let silenceStart = 0;
			
			const checkSilence = () => {
				if (!isListening) return;
				analyser.getByteFrequencyData(dataArray);
				const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
				if (avg > 10) silenceStart = 0; // Reset silence timer if noise detected
				else if (silenceStart === 0) silenceStart = Date.now();
				else if (Date.now() - silenceStart > 1200) { if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop(); return; }
				silenceAnimFrame = requestAnimationFrame(checkSilence);
			};

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunks.push(event.data);
				}
			};

			mediaRecorder.onstop = async () => {
				isListening = false;
				isProcessingAudio = true;
				
				cancelAnimationFrame(silenceAnimFrame);
				if (audioContext) { try { await audioContext.close(); } catch(e) {} }
				
				// Turn off the red recording dot instantly
				stream.getTracks().forEach(track => track.stop());

				// Yield to the event loop so Safari actually fires the final ondataavailable event
				await new Promise(resolve => setTimeout(resolve, 50));

				const audioBlob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
				if (audioBlob.size === 0) {
					isProcessingAudio = false;
					showVoiceError('No audio captured by browser.');
					return;
				}

				const formData = new FormData();
				const ext = (mediaRecorder?.mimeType || '').includes('mp4') ? 'm4a' : 'webm';
				formData.append('audio', audioBlob, `search.${ext}`);

				try {
					const res = await fetch('/api/voice-search', { method: 'POST', body: formData });
					const data = await res.json();
					
					if (res.ok && data.text) {
						q = data.text;
						
						if (data.spokenReply && 'speechSynthesis' in window) {
							const utterance = new SpeechSynthesisUtterance(data.spokenReply);
							window.speechSynthesis.speak(utterance);
						}

						if (resultsAsYouType) resultsAsYouType.classList.remove("dropdown-open");
						goto(`/search?q=${encodeURIComponent(q)}`);
					} else {
						showVoiceError(data.error || 'Failed to understand audio.');
					}
				} catch (err) {
					showVoiceError('Network error during voice search.');
				} finally {
					isProcessingAudio = false;
				}
			};

			mediaRecorder.start(); // No timeslice; forcing chunks breaks iOS Safari
			isListening = true;
			checkSilence();

		} catch (err) {
			console.error("Microphone access denied or unavailable", err);
			showVoiceError('Microphone access is required for voice search.');
		}
	}

	function toggleVoiceSearch() {
		if (isListening && mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
		} else if (!isProcessingAudio) {
			startVoiceSearch();
		}
	}
    
    async function query(ev: Event, q: string)
    {
        if(!q || q.length === 0) {
            items = [];
            selectedIndex = -1;
            return;
        }

        const res = await fetch(`/api/items?q=${encodeURIComponent(q)}&c=8&sort=newest`);
        const data = await res.json();
        items = data.items;
        selectedIndex = -1;

        resultsAsYouType.classList.add("dropdown-open");
    }

    function focus(ev: Event)
    {
		resultsAsYouType.classList.add("dropdown-open");
    }

    function blur(ev: FocusEvent)
    {
        // If focus moved to one of our dropdown links, DO NOT close the dropdown
        if (resultsAsYouType.contains(ev.relatedTarget as Node)) return;
        
        setTimeout(() => {
            resultsAsYouType.classList.remove("dropdown-open");
		}, 200);
    }

    function handleKeydown(ev: KeyboardEvent) {
        if (!items?.length || !resultsAsYouType.classList.contains("dropdown-open")) return;
        
        // Find all focusable links inside the dropdown
        // Only target the item title links and the "See all results" button at the bottom
        const links = Array.from(resultsAsYouType.querySelectorAll('.dropdown-content a.font-semibold, .dropdown-content a.btn')) as HTMLAnchorElement[];
        if (links.length === 0) return;

        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            selectedIndex = (selectedIndex + 1) % links.length;
            links[selectedIndex].focus();
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            selectedIndex = (selectedIndex - 1 + links.length) % links.length;
            links[selectedIndex].focus();
        }
    }

	$: activeVaultName = $page.data.inventories?.find(i => i.id === $page.data.activeInventoryId)?.name;
	$: searchPlaceholder = activeVaultName ? `Search in ${activeVaultName}` : "Search";
</script>

<form method="GET" action="/search" class="w-full sm:w-auto relative">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={resultsAsYouType} id="resultsAsYouType" class="dropdown dropdown-end w-full md:w-auto" on:keydown={handleKeydown}>
        
        <div class="form-control relative w-full">
            <input 
                bind:value={q}
                on:focus={focus} 
                on:blur={blur} 
                on:input={(ev)=>query(ev, q)}
                autocomplete="off" 
                type="text" 
                name="q" 
				placeholder={isListening ? 'Listening...' : (isProcessingAudio ? 'Thinking...' : searchPlaceholder)} 
				class="input input-bordered md:w-64 w-full {enableVoiceSearch ? 'pr-16' : 'pr-10'} bg-base-200/50 focus:bg-base-100 focus:shadow-inner transition-all duration-200 rounded-xl"
				disabled={isProcessingAudio}
            />
			<div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
				{#if enableVoiceSearch}
					<button type="button" class="btn btn-xs btn-ghost btn-circle text-gray-400 hover:text-primary {isListening ? 'text-error animate-pulse' : ''}" on:click|preventDefault={toggleVoiceSearch} disabled={isProcessingAudio} aria-label="Voice Search">
						{#if isProcessingAudio}
							<span class="loading loading-spinner loading-xs text-primary"></span>
						{:else}
							<i class="bi {isListening ? 'bi-stop-circle-fill text-error' : 'bi-mic'} text-base"></i>
						{/if}
					</button>
				{/if}
				{#if q.length > 0 && !isProcessingAudio}
					<button type="button" class="btn btn-xs btn-ghost btn-circle text-gray-400 hover:text-base-content" on:click|preventDefault={() => { q = ''; query(new Event('input'), ''); document.querySelector('input[name="q"]')?.focus(); }} aria-label="Clear">
						<i class="bi bi-x-circle-fill text-base"></i>
					</button>
				{:else if !enableVoiceSearch && !isProcessingAudio} <!-- actually also hide magnifying glass if we have voice search -->
					<div class="w-6 h-6 flex items-center justify-center pointer-events-none text-gray-400 mr-1">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
					</div>
				{/if}
			</div>
        </div>

		{#if voiceError}
			<div class="absolute top-full mt-2 right-0 w-64 bg-base-100 text-error text-xs font-bold p-3 rounded-xl shadow-2xl border border-error/30 z-[100] flex items-start gap-2 animate-fade-in text-left">
				<i class="bi bi-exclamation-triangle-fill mt-0.5"></i>
				<span class="flex-1 leading-tight">{voiceError}</span>
				<button type="button" class="text-error/60 hover:text-error" on:click={() => voiceError = ''}><i class="bi bi-x-lg"></i></button>
			</div>
		{/if}

        <DropdownPanel>
            {#if items?.length > 0}
				<div class="max-h-[35vh] sm:max-h-[50vh] overflow-y-auto rounded-xl overscroll-contain">
                    <Items items={items} brief={true} showControls={false} forceListView={true} />
                </div>
            {/if}
            <div class="{(items?.length > 0) ? 'mt-1 pt-1 border-t border-base-200/60' : ''} flex flex-col gap-1 sticky bottom-0 bg-base-100 z-10 pb-1">
                <a href="/search{q ? `?q=${encodeURIComponent(q)}` : ''}" class="btn btn-ghost btn-sm w-full text-primary hover:bg-primary/10 flex items-center justify-center gap-2 rounded-xl" on:click={() => resultsAsYouType.classList.remove("dropdown-open")}>
                    <i class="bi bi-search"></i> {q ? `See all results for "${q.replace(/^"|"$/g, '')}"` : 'Advanced Search & Bulk Edit'}
                </a>
            </div>
        </DropdownPanel>
    </div>
</form>

