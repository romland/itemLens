<script lang="ts">
    import { fade, scale } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
	import { spring } from 'svelte/motion';
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { notify } from "$lib/client/notifications";

    export let itemTitle = "";
    export let categories: any[] = [];
    export let allowCategoryEdit = false;

    let isOpen = false;
    let photo: any = null;
    let showOriginal = false;
	let showMenu = false;
	let fileDetails = { size: '...', type: '...', dimensions: '...' };

    // Pan & Zoom State
	// Tuned for a buttery, slight-bounce iOS feel
	let scaleVal = spring(1, { stiffness: 0.15, damping: 0.65 });
	let translateX = spring(0, { stiffness: 0.15, damping: 0.65 });
	let translateY = spring(0, { stiffness: 0.15, damping: 0.65 });
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    
    // Touch pinch state
    let initialPinchDistance: number | null = null;
    let initialScale = 1;
	let dragHasMoved = false;

	// Momentum (Gliding) Trackers
    let swipeOffsetY = 0;
	let lastDragX = 0;
	let lastDragY = 0;
	let lastDragTime = 0;
	let velocityX = 0;
	let velocityY = 0;

    // Tap tracking for manual double-tap
    let lastTapTime = 0;

    // Rotation Save State
    let saveRotationModal: HTMLDialogElement;
    let isSavingRotation = false;

    export function open(p: any) {
        photo = p;
        showOriginal = p.showOriginal || false;
        resetZoom(true);
		showMenu = false;
        isOpen = true;
		fetchDetails();
    }

	async function fetchDetails() {
		if (!photo?.orgPath) return;
		fileDetails = { size: '...', type: '...', dimensions: '...' };

		try {
			const res = await fetch(photo.orgPath, { method: 'HEAD' });
			const bytes = res.headers.get('content-length');
			const type = res.headers.get('content-type');
			let sizeStr = 'Unknown';
			if (bytes) {
				const mb = parseInt(bytes) / (1024 * 1024);
				sizeStr = mb > 1 ? `${mb.toFixed(2)} MB` : `${(parseInt(bytes) / 1024).toFixed(0)} KB`;
			}
			fileDetails = { ...fileDetails, size: sizeStr, type: type || 'Unknown' };
		} catch (e) {}

		const isVideo = photo.orgPath.match(/\.(mp4|webm|mov|ogg|mkv)$/i);
		if (isVideo) {
			const vid = document.createElement('video');
			vid.onloadedmetadata = () => {
				fileDetails = { ...fileDetails, dimensions: `${vid.videoWidth} × ${vid.videoHeight}` };
			};
			vid.src = photo.orgPath;
		} else {
			const img = new Image();
			img.onload = () => {
				fileDetails = { ...fileDetails, dimensions: `${img.naturalWidth} × ${img.naturalHeight}` };
			};
			img.src = showOriginal ? photo.orgPath : (photo.cropPath || photo.orgPath);
		}
	}

    export function close(force: any = false) {
        // Fix: Svelte event handlers pass the Event object (which is truthy).
        // We strictly check if force is exactly the boolean 'true'.
        const isForce = force === true;

        // Intercept closing if we have an unsaved rotation
        if (!isForce && photo?.id && rotation % 360 !== 0) {
            saveRotationModal.showModal();
            return;
        }
        isOpen = false;
        setTimeout(() => {
            photo = null;
            rotation = 0;
            resetZoom(true);
        }, 300); // Matches transition duration
    }

    async function saveRotation() {
        if (!photo?.id) return close(true);
        isSavingRotation = true;
        
        // Normalize rotation to positive 0-360
        const degrees = ((rotation % 360) + 360) % 360;
        
        try {
            const res = await fetch('/api/photo-rotate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoId: photo.id, degrees })
            });
            
            if (res.ok) await invalidateAll(); // Force SvelteKit URL cache refresh
            else console.error('Failed to save rotation');
        } catch (e) { console.error('Network error during rotation save', e); }
        
        isSavingRotation = false;
        saveRotationModal.close();
        close(true);
    }

    function discardRotation() {
        rotation = 0;
        saveRotationModal.close();
        close(true);
    }

    function resetZoom(hard: boolean | Event = false) {
        const isHard = hard === true; // Protect against Svelte passing MouseEvents
        scaleVal.set(1, { hard: isHard });
        translateX.set(0, { hard: isHard });
        translateY.set(0, { hard: isHard });
        rotation = 0;
        isDragging = false;
        initialPinchDistance = null;
		dragHasMoved = false;
		velocityX = 0;
		velocityY = 0;
    }

    function handleWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY * -0.005;
		const newScale = Math.min(Math.max(1, $scaleVal + delta), 5);
		scaleVal.set(newScale);
		if (newScale === 1) { translateX.set(0); translateY.set(0); }
    }

    function startDrag(e: MouseEvent | TouchEvent) {
        isDragging = true;
		dragHasMoved = false;
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
		startX = clientX - $translateX;
		startY = clientY - $translateY;

		lastDragX = clientX;
		lastDragY = clientY;
		lastDragTime = performance.now();
		velocityX = 0;
		velocityY = 0;
    }

    function onDrag(e: MouseEvent | TouchEvent) {
        if (!isDragging) return;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
		// Calculate velocity for gliding (pixels per millisecond)
		const now = performance.now();
		const dt = now - lastDragTime;
		if (dt > 0) {
			velocityX = (clientX - lastDragX) / dt;
			velocityY = (clientY - lastDragY) / dt;
		}
		lastDragX = clientX;
		lastDragY = clientY;
		lastDragTime = now;

		let rawX = clientX - startX;
		let rawY = clientY - startY;

        // If fully zoomed out, track vertical drag for swipe-to-close
        if ($scaleVal === 1) {
            swipeOffsetY = rawY;
            translateY.set(rawY, { hard: true });
            return;
        }

		// Determine bounds based on scale
		const maxTx = Math.max(0, (window.innerWidth * ($scaleVal - 1)) / 2);
		const maxTy = Math.max(0, (window.innerHeight * ($scaleVal - 1)) / 2);

		// Apply rubber-band resistance if dragging past the edges
		if (rawX > maxTx) rawX = maxTx + (rawX - maxTx) * 0.3;
		else if (rawX < -maxTx) rawX = -maxTx + (rawX + maxTx) * 0.3;

		if (rawY > maxTy) rawY = maxTy + (rawY - maxTy) * 0.3;
		else if (rawY < -maxTy) rawY = -maxTy + (rawY + maxTy) * 0.3;

		if (Math.abs(rawX - $translateX) > 3 || Math.abs(rawY - $translateY) > 3) dragHasMoved = true;

		translateX.set(rawX, { hard: true });
		translateY.set(rawY, { hard: true });
    }

    function endDrag() {
        isDragging = false;
        initialPinchDistance = null;
		
		if ($scaleVal < 1) {
			scaleVal.set(1);
			translateX.set(0);
			translateY.set(0);
            swipeOffsetY = 0;
			return;
		}

        if ($scaleVal === 1) {
            if (Math.abs(swipeOffsetY) > 100) {
                close();
            } else {
                translateY.set(0);
            }
            swipeOffsetY = 0;
            return;
        }

		const maxTx = Math.max(0, (window.innerWidth * ($scaleVal - 1)) / 2);
		const maxTy = Math.max(0, (window.innerHeight * ($scaleVal - 1)) / 2);
		
		let targetTx = $translateX;
		let targetTy = $translateY;

		// Momentum Glide: If released while in motion (less than 50ms since last movement), throw it forward
		if (performance.now() - lastDragTime < 50) {
			const momentumMultiplier = 200; // Adjust for more/less slide distance
			targetTx += velocityX * momentumMultiplier;
			targetTy += velocityY * momentumMultiplier;
		}

		// Clamp the projected target to the boundaries. 
		// The spring will naturally decelerate and glide smoothly into these limits.
		translateX.set(Math.max(-maxTx, Math.min(maxTx, targetTx)));
		translateY.set(Math.max(-maxTy, Math.min(maxTy, targetTy)));
    }

    function handleTouchStart(e: TouchEvent) {
        if (e.touches.length === 2) {
            initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
			initialScale = $scaleVal;
        } else {
           const now = Date.now();
           if (now - lastTapTime < 300) {
               // Double tap detected
               const target = $scaleVal > 1 ? 1 : 2.5; 
               scaleVal.set(target); 
               translateX.set(0); translateY.set(0);
               lastTapTime = 0; // reset
               e.preventDefault();
           } else {
               lastTapTime = now;
               startDrag(e);
           }
        }
    }

    function handleTouchMove(e: TouchEvent) {
        if (e.touches.length === 2 && initialPinchDistance) {
            e.preventDefault();
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
			const newScale = Math.min(Math.max(1, initialScale * (currentDistance / initialPinchDistance)), 5);
			
			let elasticScale = newScale;
			// Apply rubber-band resistance if pinching out smaller than original size
			if (elasticScale < 1) elasticScale = 1 - (1 - elasticScale) * 0.5;

			scaleVal.set(elasticScale, { hard: true });
        } else {
            onDrag(e);
        }
    }
    
    function toggleOriginal() {
        showOriginal = !showOriginal;
    }

	function handleBackgroundClick() {
		// Prevent closing if the user was simply flicking/dragging the image and let go on the background
		if (dragHasMoved) {
			dragHasMoved = false;
			return;
		}
		close();
	}

	async function downloadImage() {
		try {
			const path = showOriginal ? photo.orgPath : (photo.cropPath || photo.orgPath);
			const res = await fetch(path);
			const blob = await res.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.style.display = 'none';
			a.href = url;
			a.download = path.split('/').pop() || 'download.png';
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			showMenu = false;
		} catch (e) { console.error('Download failed', e); }
	}

	function copyLink() {
		const path = showOriginal ? photo.orgPath : (photo.cropPath || photo.orgPath);
		navigator.clipboard.writeText(window.location.origin + path);
		showMenu = false;
        notify('success', 'Link copied to clipboard!');
	}

    async function copyImageToClipboard() {
        try {
            const path = showOriginal ? photo.orgPath : (photo.cropPath || photo.orgPath);
            const res = await fetch(path);
            const blob = await res.blob();
            
            // The Clipboard API strictly rejects WebP and JPEG in most browsers.
            // We must transcode it to a pure PNG via Canvas before copying.
            if (blob.type === 'image/webp' || blob.type === 'image/jpeg') {
                const img = new Image();
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = URL.createObjectURL(blob); });
                
                canvas.width = img.width; canvas.height = img.height;
                ctx?.drawImage(img, 0, 0);
                
                const pngBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
                if (pngBlob) await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
            } else {
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            }
            showMenu = false;
            notify('success', 'Image copied to clipboard!');
        } catch (e) {
            console.error('Copy image failed', e);
            notify('error', 'Failed to copy image');
        }
    }

    // Rotation State
    let rotation = 0;
    function rotateLeft() { rotation -= 90; }
    function rotateRight() { rotation += 90; }

    $: ai = (() => {
        if (!photo?.llmAnalysis) return null;
        try {
            const cleanJson = photo.llmAnalysis.replace(/```json/gi, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            return null;
        }
    })();

    $: parsedColors = (() => {
        if (!photo?.colors || photo.colors.length <= 2) return null;
        try { return JSON.parse(photo.colors); } catch(e) { return null; }
    })();
    
    $: cols = parsedColors ? Object.keys(parsedColors) : [];
    $: colNames = parsedColors ? Object.values(parsedColors) : [];
</script>

<svelte:window on:keydown={(e) => {
    if (e.key === 'Escape' && isOpen) {
        if (saveRotationModal?.open) {
            return; // Let native dialog close handle it
        }
        e.preventDefault(); // Stop browser from instantly dismissing the dialog we are about to open
        close();
    }
}} />

{#if isOpen}
    <!-- Backdrop & Container -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
        class="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center overscroll-none touch-none overflow-y-scroll"
        transition:fade={{ duration: 250, easing: cubicOut }}
		on:click|self={handleBackgroundClick}
    >
        <!-- Header (Glassmorphic) -->
        <div class="absolute top-0 inset-x-0 p-4 sm:p-6 flex justify-between items-start bg-gradient-to-b from-black/60 to-transparent z-50 pointer-events-none">
            <div class="text-white drop-shadow-md pr-4 pointer-events-auto max-w-[80%]">
                <h2 class="text-xl sm:text-2xl font-bold tracking-tight line-clamp-1 sm:line-clamp-2">
                    {itemTitle}
                </h2>
                <div class="flex items-center gap-2 mt-1.5 opacity-90">
                    {#if photo?.type}
                        <span class="text-xs font-semibold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded backdrop-blur-md">
                            {photo.type}
                        </span>
                    {/if}
                    {#if ai?.subCategory}
                        <span class="text-xs font-semibold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded backdrop-blur-md">
                            {ai.subCategory}
                        </span>
                    {/if}
                    {#if ai?.description}
                        <span class="text-xs sm:text-sm text-gray-200 line-clamp-1 ml-1">
                            &mdash; {ai.description}
                        </span>
                    {/if}
                </div>
            </div>
			<div class="flex items-center gap-2 pointer-events-auto shrink-0 relative">
				<button 
					class="btn btn-circle btn-ghost bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur-md" 
					on:click={() => showMenu = !showMenu}
					aria-label="More Actions"
				>
					<i class="bi bi-three-dots-vertical text-xl"></i>
				</button>
				{#if showMenu}
                    <!-- Invisible backdrop to catch clicks outside the menu -->
                    <div class="fixed inset-0 z-40" on:click|stopPropagation={() => showMenu = false} role="button" tabindex="0" aria-label="Close menu"></div>
					<div class="absolute top-14 right-0 w-56 bg-black/60 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden flex flex-col p-1 animate-fade-in z-50">
						<div class="px-3 py-2 border-b border-white/10 flex flex-col mb-1">
							<span class="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1">Details</span>
							<span class="text-xs text-white/90 truncate"><i class="bi bi-file-earmark mr-1"></i> {fileDetails.type}</span>
							<span class="text-xs text-white/90"><i class="bi bi-aspect-ratio mr-1"></i> {fileDetails.dimensions}</span>
							<span class="text-xs text-white/90"><i class="bi bi-hdd mr-1"></i> {fileDetails.size}</span>
						</div>

                        {#if allowCategoryEdit && photo?.type === 'product' && photo?.id}
                            <div class="border-b border-white/10 pb-1 mb-1">
                                <div class="relative w-full">
                                    <i class="bi bi-tag text-lg w-5 opacity-70 absolute left-3 top-2 pointer-events-none text-white"></i>
                                    <select class="select select-sm bg-transparent text-white hover:bg-white/20 border-none font-medium text-sm h-10 min-h-0 pl-10 pr-8 w-full rounded-xl outline-none cursor-pointer appearance-none" 
                                        value={photo.category?.name || ''} 
                                        on:change={async (e) => {
                                            e.currentTarget.blur();
                                            let newCat = e.currentTarget.value;
                                            if (newCat === '_new') {
                                                newCat = prompt('Enter new category name:');
                                                if (!newCat || !newCat.trim()) {
                                                    e.currentTarget.value = photo.category?.name || '';
                                                    return;
                                                }
                                            }
                                            showMenu = false;
                                            
                                            const fd = new FormData();
                                            fd.append('photoId', photo.id.toString());
                                            fd.append('categoryName', newCat.trim());
                                            await fetch(window.location.pathname + '?/changeCategory', {
                                                method: 'POST',
                                                body: fd,
                                                headers: { 'x-sveltekit-action': 'true', 'accept': 'application/json' }
                                            });
                                            await invalidateAll();
                                        }}>
                                        <option value="" disabled>Category...</option>
                                        {#each categories as c}
                                            <option value={c.name} class="capitalize bg-base-100 text-base-content">{c.name}</option>
                                        {/each}
                                        <option value="_new" class="bg-base-100 text-base-content">+ New Category...</option>
                                    </select>
                                </div>
                            </div>
                        {/if}
                        
                        <button class="btn btn-ghost btn-sm text-white hover:bg-white/20 justify-start h-10 px-3 font-medium rounded-xl" on:click={copyImageToClipboard}>
                            <i class="bi bi-clipboard text-lg w-5 opacity-70"></i> Copy Image
                        </button>
						<button class="btn btn-ghost btn-sm text-white hover:bg-white/20 justify-start h-10 px-3 font-medium rounded-xl" on:click={downloadImage}>
							<i class="bi bi-download text-lg w-5 opacity-70"></i> Save to Device
						</button>
						<button class="btn btn-ghost btn-sm text-white hover:bg-white/20 justify-start h-10 px-3 font-medium rounded-xl" on:click={copyLink}>
							<i class="bi bi-link-45deg text-lg w-5 opacity-70"></i> Copy Direct Link
						</button>
					</div>
				{/if}
				<button 
                   class="btn btn-circle btn-ghost bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur-md hidden sm:inline-flex"
                    on:click={() => close()}
					aria-label="Close lightbox"
				>
					<i class="bi bi-x-lg text-xl"></i>
				</button>
			</div>
        </div>

        <!-- Interactive Image Canvas -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div 
			class="w-full h-full flex items-center justify-center overflow-hidden {$scaleVal > 1 ? 'cursor-move' : ''}"
            on:wheel|nonpassive={handleWheel}
            on:mousedown={startDrag}
            on:mousemove={onDrag}
            on:mouseup={endDrag}
            on:mouseleave={endDrag}
            on:touchstart|nonpassive={handleTouchStart}
            on:touchmove|nonpassive={handleTouchMove}
            on:touchend={endDrag}
			on:dblclick={() => { const target = $scaleVal > 1 ? 1 : 2.5; scaleVal.set(target); translateX.set(0); translateY.set(0); }}
			on:click|self={handleBackgroundClick}
        >
            <div 
                class="w-full h-full flex items-center justify-center origin-center"
				style="transform: translate({$translateX}px, {$translateY}px) scale({$scaleVal}); will-change: transform;"
                in:scale={{ start: 0.9, duration: 300, easing: cubicOut }}
                on:click|self={handleBackgroundClick}
            >
                <!-- Tightly wrapped container ensures absolute percentage math perfectly matches the image -->
                <div class="relative inline-flex max-w-full max-h-full shadow-2xl transition-transform duration-300 ease-out {photo?.box ? 'overflow-hidden rounded-xl' : ''}" style="transform: rotate({rotation}deg);">
                    {#if photo?.orgPath?.match(/\.(mp4|webm|mov|ogg|mkv)$/i)}
                        <video 
                            src="{photo?.orgPath}" 
                            class="object-contain max-w-full max-h-full origin-center select-none rounded-xl"
                            controls autoplay
                            draggable="false"
                        >
                            <track kind="captions" />
                        </video>
                    {:else}
                        <img 
                            src="{showOriginal ? photo?.orgPath : (photo?.cropPath || photo?.orgPath)}" 
                            alt="Product preview" 
                            class="object-contain max-w-full max-h-full origin-center select-none"
                            draggable="false"
                        />
                    {/if}
                    {#if photo?.box}
                        <!-- The massive box-shadow dims everything OUTSIDE the bounding box -->
                        <div class="absolute border-4 border-primary z-10 pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.8)]"
                             style="top: {photo.box[0]/10}%; left: {photo.box[1]/10}%; width: {(photo.box[3]-photo.box[1])/10}%; height: {(photo.box[2]-photo.box[0])/10}%;">
                            <!-- Inner pulsing reticle -->
                            <div class="absolute inset-0 border-2 border-white/60 animate-pulse"></div>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Footer (Controls & Swatches) -->
        <div class="absolute bottom-0 inset-x-0 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-50 pointer-events-none">
            
            <!-- Color Swatches -->
            <div class="flex gap-2 pointer-events-auto">
                {#each cols as col, i}
                    <div class="tooltip tooltip-top" data-tip="{colNames[i]}">
                        <div class="w-8 h-8 rounded-full border border-white/30 shadow-lg" style="background-color: {col};"></div>
                    </div>
                {/each}
            </div>

            <!-- Toolbar Controls -->
            <div class="flex items-center gap-1 sm:gap-4 bg-white/10 backdrop-blur-xl p-1.5 rounded-full border border-white/20 shadow-xl pointer-events-auto max-w-full overflow-x-auto hide-scrollbar">
                
                <!-- Segmented Control for Cutout/Original -->
                {#if photo?.cropPath && photo?.type === "product"}
                    <div class="flex bg-black/40 rounded-full p-1 relative">
                        <button 
                            class="relative z-10 px-4 py-1.5 text-sm font-semibold rounded-full transition-colors duration-200 {showOriginal ? 'text-white/60 hover:text-white' : 'text-black'}" 
                            on:click={() => showOriginal = false}
                        >
                            Cutout
                        </button>
                        <button 
                            class="relative z-10 px-4 py-1.5 text-sm font-semibold rounded-full transition-colors duration-200 {showOriginal ? 'text-black' : 'text-white/60 hover:text-white'}" 
                            on:click={() => showOriginal = true}
                        >
                            Original
                        </button>
                        <!-- Active Pill Background -->
                        <div 
                            class="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] bg-white rounded-full shadow transition-transform duration-300 ease-out"
                            style="transform: translateX({showOriginal ? 'calc(100% + 0.25rem)' : '0'});"
                        ></div>
                    </div>
                {/if}

                <!-- Tools (Rotate & Zoom) -->
                <div class="flex items-center gap-1 px-2 text-white/80">
                    <button class="btn btn-circle btn-sm btn-ghost hover:bg-white/20 hover:text-white border-none" on:click={rotateLeft} aria-label="Rotate Left"><i class="bi bi-arrow-counterclockwise"></i></button>
                    <button class="btn btn-circle btn-sm btn-ghost hover:bg-white/20 hover:text-white border-none" on:click={rotateRight} aria-label="Rotate Right"><i class="bi bi-arrow-clockwise"></i></button>
                    
                    <div class="w-px h-4 bg-white/20 mx-1 hidden sm:block"></div>
                    
					<button class="hidden sm:inline-flex btn btn-circle btn-sm btn-ghost hover:bg-white/20 hover:text-white border-none" on:click={() => { const newS = Math.max(1, $scaleVal - 0.5); scaleVal.set(newS); if(newS===1){translateX.set(0); translateY.set(0);} }} aria-label="Zoom Out"><i class="bi bi-zoom-out"></i></button>
                    <button class="hidden sm:inline-flex btn btn-circle btn-sm btn-ghost hover:bg-white/20 hover:text-white border-none" on:click={resetZoom} aria-label="Reset"><i class="bi bi-arrows-collapse"></i></button>
					<button class="hidden sm:inline-flex btn btn-circle btn-sm btn-ghost hover:bg-white/20 hover:text-white border-none" on:click={() => scaleVal.set(Math.min(5, $scaleVal + 0.5))} aria-label="Zoom In"><i class="bi bi-zoom-in"></i></button>
                     <!-- Mobile close button inside the toolbar to prevent overlap -->
                     <button class="sm:hidden btn btn-circle btn-sm btn-ghost bg-white/20 text-white border-none ml-1" on:click={() => close()} aria-label="Close"><i class="bi bi-x-lg"></i></button>
                </div>
            </div>
        </div>

    </div>
{/if}

<dialog bind:this={saveRotationModal} class="modal modal-bottom sm:modal-middle" on:close={() => { if (!isSavingRotation) discardRotation(); }}>
    <div class="modal-box p-6 sm:rounded-3xl bg-base-100/95 backdrop-blur-xl border border-base-200 shadow-2xl">
        <h3 class="font-bold text-xl mb-3 flex items-center gap-2">
            <i class="bi bi-arrow-clockwise text-primary"></i> Save Rotation?
        </h3>
        <p class="text-sm text-gray-500 mb-6">You've rotated this image. Do you want to permanently save this new orientation?</p>
        
        <div class="modal-action mt-0 flex gap-2">
            <button type="button" class="btn btn-ghost flex-1 rounded-xl" on:click={discardRotation} disabled={isSavingRotation}>Discard</button>
            <button type="button" class="btn btn-primary flex-1 rounded-xl shadow-md" on:click={saveRotation} disabled={isSavingRotation}>
                {#if isSavingRotation}
                    <span class="loading loading-spinner loading-sm"></span> Saving...
                {:else}
                    Save & Close
                {/if}
            </button>
        </div>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-backdrop" role="button" tabindex="0" on:keydown={(e) => { if(e.key==='Escape' && !isSavingRotation) saveRotationModal.close()}} on:click={() => { if (!isSavingRotation) saveRotationModal.close(); }}></div>
</dialog>