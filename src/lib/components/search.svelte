<script lang="ts">
    /*
     * Reason for having searching in here (as well) is that it is 
     * that 'search-as-you-type' is tied to the input field.
     */
    import Items from "$lib/components/items.svelte";
    import DropdownPanel from "$lib/components/DropdownPanel.svelte";
	import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { enhance } from "$app/forms";

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
	let voiceFeedback: { type: 'error' | 'success', query?: string, reply?: string, message?: string } | null = null;
	let voiceFeedbackTimer: ReturnType<typeof setTimeout>;
	
	// Reactive flag to trigger our hidden Voice Intent Debug UI
	$: isVoiceTestMode = q.startsWith('/v ');

    // iOS Safari Hack: Global reference prevents aggressive garbage collection from killing voice mid-sentence
    let currentUtterance: SpeechSynthesisUtterance | null = null;

	function speak(text: string) {
		if (!('speechSynthesis' in window)) return;
         console.log('🗣️ [VOICE-DEBUG] Queueing speech:', text);
         window.speechSynthesis.resume(); // iOS Safari Hack: Wake up the audio context after an async fetch
         currentUtterance = new SpeechSynthesisUtterance(text);
         currentUtterance.volume = 1.0;
         currentUtterance.onstart = () => console.log('🗣️ [VOICE-DEBUG] Speech started playing.');
         currentUtterance.onerror = (e) => console.error('🗣️ [VOICE-DEBUG] Speech error:', e);
		if (userPrefs.voiceURI) {
			const voices = window.speechSynthesis.getVoices();
			const voice = voices.find(v => v.voiceURI === userPrefs.voiceURI);
              if (voice) currentUtterance.voice = voice;
		}
         window.speechSynthesis.speak(currentUtterance);
	}

	function showVoiceFeedback(type: 'error' | 'success', query?: string, reply?: string, message?: string) {
		voiceFeedback = { type, query, reply, message };
		clearTimeout(voiceFeedbackTimer);
		voiceFeedbackTimer = setTimeout(() => voiceFeedback = null, type === 'error' ? 5000 : 8000);
	}

	async function startVoiceSearch() {
		try {
			// Safari PWA Hack: Unlock SpeechSynthesis audio context synchronously on user interaction
			if ('speechSynthesis' in window) {
					// FATAL BUG FIX: Empty strings ('') permanently hang the iOS speech queue! Must be a space.
					const silentUtterance = new SpeechSynthesisUtterance(' ');
					silentUtterance.volume = 0.01;
				window.speechSynthesis.speak(silentUtterance);
			}

			if (navigator.vibrate) navigator.vibrate(50);
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
            let hasSpoken = false;
			let silenceStart = 0;
            const recordingStart = Date.now();
			
			const checkSilence = () => {
				if (!isListening) return;
				analyser.getByteFrequencyData(dataArray);
				const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                if (avg > 15) {
                    hasSpoken = true;
                    silenceStart = 0;
                } else if (hasSpoken) {
                    if (silenceStart === 0) silenceStart = Date.now();
                    else if (Date.now() - silenceStart > 1300) {
                        if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
                        return;
                    }
                } else if (Date.now() - recordingStart > 10000) {
                    if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
                    return;
                }
				silenceAnimFrame = requestAnimationFrame(checkSilence);
			};

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunks.push(event.data);
				}
			};

			mediaRecorder.onstop = async () => {
				isListening = false;
				if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
				isProcessingAudio = true;
				
				cancelAnimationFrame(silenceAnimFrame);
				
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
						

						if (resultsAsYouType) resultsAsYouType.classList.remove("dropdown-open");
						if (data.spokenReply) {
							speak(data.spokenReply);
						}
						showVoiceFeedback('success', data.text, data.spokenReply || "Routing to search results...");
                        const destination = data.route || `/search?q=${encodeURIComponent(data.text)}`;
                        goto(destination);
					} else {
						showVoiceFeedback('error', undefined, undefined, data.error || 'Failed to understand audio.');
					}
				} catch (err) {
					showVoiceFeedback('error', undefined, undefined, 'Network error during voice search.');
				} finally {
					isProcessingAudio = false;
				}
			};

			mediaRecorder.start(); // No timeslice; forcing chunks breaks iOS Safari
			isListening = true;
			checkSilence();

		} catch (err) {
			console.error("Microphone access denied or unavailable", err);
			showVoiceFeedback('error', undefined, undefined, 'Microphone access is required for voice search.');
		}
	}

	function toggleVoiceSearch() {
		if (isListening && mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
		} else if (!isProcessingAudio) {
			startVoiceSearch();
		}
	}

	async function testVoiceCommand(text: string) {
		if (!text.trim()) return;
		try {
			isProcessingAudio = true;
			const formData = new FormData();
			formData.append('textQuery', text);

			const res = await fetch('/api/voice-search', { method: 'POST', body: formData });
			const data = await res.json();
			
			if (res.ok && data.text) {
				q = data.text;
				if (resultsAsYouType) resultsAsYouType.classList.remove("dropdown-open");
				if (data.spokenReply) {
					speak(data.spokenReply);
				}

				// Show the transcript and response right under the search box
				showVoiceFeedback('success', data.text, data.spokenReply || "Routing to search results...");

				const destination = data.route || `/search?q=${encodeURIComponent(data.text)}`;
				goto(destination);
			} else {
				showVoiceFeedback('error', undefined, undefined, data.error || 'Failed to process voice command test.');
			}
		} catch (err) {
			showVoiceFeedback('error', undefined, undefined, 'Network error during voice test.');
		} finally {
			isProcessingAudio = false;
		}
	}

    async function query(ev: Event, q: string)
    {
		// [VOICE DEBUGGER] Intercept the query if it starts with the test prefix
		// We clear standard items but FORCE the dropdown open to show the debug UI.
		if (q.startsWith('/v ')) {
            items = [];
            selectedIndex = -1;
			if (resultsAsYouType) resultsAsYouType.classList.add("dropdown-open");
            return;
        }

        const res = await fetch(`/api/items?q=${encodeURIComponent(q)}&c=8&sort=newest`);

		// [STANDARD SEARCH]
		if(!q || q.length === 0) {
			items = [];
			selectedIndex = -1;
			if (resultsAsYouType) resultsAsYouType.classList.remove("dropdown-open");
			return;
		}
        const data = await res.json();
        items = data.items;
        selectedIndex = -1;

        if (resultsAsYouType) resultsAsYouType.classList.add("dropdown-open");
    }

    function focus(ev: Event)
    {
		if (resultsAsYouType) resultsAsYouType.classList.add("dropdown-open");
    }

    function blur(ev: FocusEvent)
    {
        // If focus moved to one of our dropdown links, DO NOT close the dropdown
        if (resultsAsYouType && resultsAsYouType.contains(ev.relatedTarget as Node)) return;
        
        setTimeout(() => {
            if (resultsAsYouType) resultsAsYouType.classList.remove("dropdown-open");
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

<form method="GET" action="/search" class="w-full sm:w-auto relative" on:submit|preventDefault={() => {
    if (resultsAsYouType) resultsAsYouType.classList.remove("dropdown-open");
	if (q.startsWith('/v ')) {
		testVoiceCommand(q.substring(3).trim());
		return;
	}
    goto(`/search?q=${encodeURIComponent(q)}`);
}}>
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

		{#if voiceFeedback}
			<div class="absolute top-full mt-3 right-0 w-72 bg-base-100/95 backdrop-blur-xl text-xs p-4 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] border z-[100] flex items-start gap-3 animate-fade-in text-left {voiceFeedback.type === 'error' ? 'border-error/40' : 'border-primary/20'}">
				<div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center {voiceFeedback.type === 'error' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}">
					<i class="bi {voiceFeedback.type === 'error' ? 'bi-exclamation-triangle-fill' : 'bi-robot'} text-lg"></i>
				</div>
				<div class="flex-1 leading-tight flex flex-col gap-1.5 min-w-0">
					{#if voiceFeedback.type === 'error'}
						<span class="font-bold text-error">{voiceFeedback.message}</span>
					{:else}
						<span class="font-medium text-gray-500 italic truncate">"{voiceFeedback.query}"</span>
						<span class="font-bold text-base-content text-sm">{voiceFeedback.reply}</span>
					{/if}
				</div>
				<button type="button" class="text-gray-400 hover:text-base-content shrink-0 p-1" on:click={() => voiceFeedback = null} aria-label="Dismiss"><i class="bi bi-x-lg"></i></button>
			</div>
		{/if}

        <DropdownPanel>
			{#if isVoiceTestMode}
				<!-- 🛠️ PREMIUM DEBUG UI FOR VOICE COMMANDS -->
				<div class="p-6 text-center bg-base-200/50 rounded-xl border border-primary/20 m-2 animate-fade-in">
					<div class="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
						<i class="bi bi-robot text-2xl"></i>
					</div>
					<h3 class="font-bold text-base-content mb-1">Voice Intent Debugger</h3>
					<p class="text-xs text-gray-500 mb-4">Simulates speech-to-text. Hit <kbd class="kbd kbd-xs shadow-sm bg-base-100">Enter</kbd> to test.</p>
					
					{#if q.length > 3}
						<div class="bg-base-100 p-3 rounded-lg border border-base-300 font-mono text-sm text-primary shadow-inner">
							"{q.substring(3).trim()}"
						</div>
					{:else}
						<div class="bg-base-100 p-3 rounded-lg border border-base-300 font-mono text-sm text-gray-400 shadow-inner italic">
							Waiting for input...
						</div>
					{/if}
				</div>
			{:else if items?.length > 0}
				<div class="max-h-[35vh] sm:max-h-[50vh] overflow-y-auto rounded-xl overscroll-contain">
                    <Items items={items} brief={true} showControls={false} forceListView={true} />
                </div>
            {/if}
			
			{#if !isVoiceTestMode}
				<div class="{(items?.length > 0) ? 'mt-1 pt-1 border-t border-base-200/60' : ''} flex flex-col gap-1 sticky bottom-0 bg-base-100 z-10 pb-1">
					<a href="/search{q ? `?q=${encodeURIComponent(q)}` : ''}" class="btn btn-ghost btn-sm w-full text-primary hover:bg-primary/10 flex items-center justify-center gap-2 rounded-xl" on:click={() => resultsAsYouType.classList.remove("dropdown-open")}>
						<i class="bi bi-search"></i> {q ? `See all results for "${q.replace(/^"|"$/g, '')}"` : 'Advanced Search & Bulk Edit'}
					</a>
				</div>
			{/if}
        </DropdownPanel>
    </div>
</form>

