<script lang="ts">
    import { fade, scale } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';

    export let itemTitle = "";

    let isOpen = false;
    let photo: any = null;
    let showOriginal = false;

    // Pan & Zoom State
    let scaleVal = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    
    // Touch pinch state
    let initialPinchDistance: number | null = null;
    let initialScale = 1;

    export function open(p: any) {
        photo = p;
        showOriginal = p.showOriginal || false;
        resetZoom();
        isOpen = true;
        // Lock body scrolling
        if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
    }

    export function close() {
        isOpen = false;
        setTimeout(() => {
            photo = null;
            if (typeof document !== 'undefined') document.body.style.overflow = '';
        }, 300); // Matches transition duration
    }

    function resetZoom() {
        scaleVal = 1;
        translateX = 0;
        translateY = 0;
        rotation = 0;
        isDragging = false;
        initialPinchDistance = null;
    }

    function handleWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY * -0.005;
        scaleVal = Math.min(Math.max(1, scaleVal + delta), 5);
        if (scaleVal === 1) { translateX = 0; translateY = 0; }
    }

    function startDrag(e: MouseEvent | TouchEvent) {
        if (scaleVal <= 1) return;
        isDragging = true;
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        startX = clientX - translateX;
        startY = clientY - translateY;
    }

    function onDrag(e: MouseEvent | TouchEvent) {
        if (!isDragging) return;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        translateX = clientX - startX;
        translateY = clientY - startY;
    }

    function endDrag() {
        isDragging = false;
        initialPinchDistance = null;
    }

    function handleTouchStart(e: TouchEvent) {
        if (e.touches.length === 2) {
            initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialScale = scaleVal;
        } else {
            startDrag(e);
        }
    }

    function handleTouchMove(e: TouchEvent) {
        if (e.touches.length === 2 && initialPinchDistance) {
            e.preventDefault();
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            scaleVal = Math.min(Math.max(1, initialScale * (currentDistance / initialPinchDistance)), 5);
            if (scaleVal === 1) { translateX = 0; translateY = 0; }
        } else {
            onDrag(e);
        }
    }
    
    function toggleOriginal() {
        showOriginal = !showOriginal;
    }

    // Rotation State
    let rotation = 0;
    function rotateLeft() { rotation -= 90; }
    function rotateRight() { rotation += 90; }

    $: ai = photo?.llmAnalysis ? JSON.parse(photo.llmAnalysis) : null;
    $: cols = photo?.colors && photo.colors.length > 2 ? Object.keys(JSON.parse(photo.colors)) : [];
    $: colNames = photo?.colors && photo.colors.length > 2 ? Object.values(JSON.parse(photo.colors)) : [];
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && close()} />

{#if isOpen}
    <!-- Backdrop & Container -->
    <div 
        class="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center overscroll-none touch-none"
        transition:fade={{ duration: 250, easing: cubicOut }}
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
            <button 
                class="btn btn-circle btn-ghost bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur-md pointer-events-auto shrink-0" 
                on:click={close}
                aria-label="Close lightbox"
            >
                <i class="bi bi-x-lg text-xl"></i>
            </button>
        </div>

        <!-- Interactive Image Canvas -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div 
            class="w-full h-full flex items-center justify-center overflow-hidden {scaleVal > 1 ? 'cursor-move' : ''}"
            on:wheel|nonpassive={handleWheel}
            on:mousedown={startDrag}
            on:mousemove={onDrag}
            on:mouseup={endDrag}
            on:mouseleave={endDrag}
            on:touchstart|nonpassive={handleTouchStart}
            on:touchmove|nonpassive={handleTouchMove}
            on:touchend={endDrag}
            on:dblclick={() => { scaleVal = scaleVal > 1 ? 1 : 2.5; translateX = 0; translateY = 0; }}
        >
            <div 
                class="w-full h-full flex items-center justify-center origin-center"
                style="transform: translate({translateX}px, {translateY}px) scale({scaleVal}); will-change: transform;"
                in:scale={{ start: 0.9, duration: 300, easing: cubicOut }}
            >
                <img 
                    src="{showOriginal ? photo?.orgPath : (photo?.cropPath || photo?.orgPath)}" 
                    alt="Product preview" 
                    class="object-contain max-w-full max-h-full origin-center select-none shadow-2xl transition-transform duration-300 ease-out"
                    style="transform: rotate({rotation}deg);"
                    draggable="false"
                />
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
            <div class="flex items-center gap-4 bg-white/10 backdrop-blur-xl p-1.5 rounded-full border border-white/20 shadow-xl pointer-events-auto">
                
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
                    
                    <button class="hidden sm:inline-flex btn btn-circle btn-sm btn-ghost hover:bg-white/20 hover:text-white border-none" on:click={() => { scaleVal = Math.max(1, scaleVal - 0.5); if(scaleVal===1){translateX=0; translateY=0;} }} aria-label="Zoom Out"><i class="bi bi-zoom-out"></i></button>
                    <button class="hidden sm:inline-flex btn btn-circle btn-sm btn-ghost hover:bg-white/20 hover:text-white border-none" on:click={resetZoom} aria-label="Reset"><i class="bi bi-arrows-collapse"></i></button>
                    <button class="hidden sm:inline-flex btn btn-circle btn-sm btn-ghost hover:bg-white/20 hover:text-white border-none" on:click={() => scaleVal = Math.min(5, scaleVal + 0.5)} aria-label="Zoom In"><i class="bi bi-zoom-in"></i></button>
                </div>
            </div>
        </div>
        <!-- Mobile Close Button (Bottom Right) -->
        <button 
            class="absolute bottom-6 right-4 sm:hidden btn btn-circle btn-ghost bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md shadow-2xl pointer-events-auto z-[60]"
            on:click={close}
            aria-label="Close lightbox"
        >
            <i class="bi bi-x-lg text-lg"></i>
        </button>

    </div>
{/if}