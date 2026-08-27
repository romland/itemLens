<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import { tick, onDestroy } from 'svelte';
    import { page } from '$app/stores';

    export let isOpen = false;
    let doc: any = null;
    let loading = false;
    let viewerRef: HTMLDivElement;
    let overlayRef: HTMLDivElement;
    let iframeRef: HTMLIFrameElement;
    let docType: 'epub' | 'iframe' | 'none' = 'none';
    let invertIframe = false;
    
    let book: any = null;
    let rendition: any = null;
    
    // UI Chrome State
    let showMenu = true;
    let menuTimeout: ReturnType<typeof setTimeout>;
    let showToc = false;
    let showSettings = false;
    
    // Reading State
    let atStart = true;
    let atEnd = false;
    let progress = 0;
    let currentChapter = "";
    let toc: any[] = [];
    let locationsGenerated = false;
    
    // Settings
    let fontSize = 100;
    let fontFamily = 'system-ui, -apple-system, sans-serif';

    // Prevent background scrolling when lightbox is open
    $: if (typeof document !== 'undefined') {
        if (isOpen) document.body.classList.add('overflow-hidden');
        else document.body.classList.remove('overflow-hidden');
    }
    onDestroy(() => {
        if (typeof document !== 'undefined') document.body.classList.remove('overflow-hidden');
    });

    export async function open(documentRecord: any) {
        doc = documentRecord;
        isOpen = true;
        loading = true;
        showMenu = true;
        showToc = false;
        showSettings = false;
        atStart = true;
        atEnd = false;
        progress = 0;
        currentChapter = "";
        toc = [];
        locationsGenerated = false;
        invertIframe = false;

        const path = (doc.path || doc.source || '').toLowerCase();
        if (path.endsWith('.epub')) {
            docType = 'epub';
            resetMenuTimeout();
        } else if (path.match(/\.(pdf|html|htm|txt|md|csv)$/i)) {
            docType = 'iframe';
            clearTimeout(menuTimeout); // Prevent auto-hide so user is never trapped
        } else {
            window.open(doc.path || doc.source, '_blank');
            close();
            return;
        }
        
        // Hydrate document dark mode preference
        const userPrefs = JSON.parse($page.data.user?.preferences || '{}');
        if (docType === 'iframe') invertIframe = userPrefs.documentDarkMode === true;

        // Load user's persistent reading preferences
        const savedPrefs = localStorage.getItem('itemlens_epub_prefs');
        if (savedPrefs) {
            try {
                const prefs = JSON.parse(savedPrefs);
                if (prefs.fontSize) fontSize = prefs.fontSize;
                if (prefs.fontFamily) fontFamily = prefs.fontFamily;
            } catch(e) {}
        }

        await tick(); // Wait for DOM to mount viewerRef
        if (overlayRef) overlayRef.focus();
        
        if (docType === 'iframe') return; // Iframe handles its own loading state via on:load

        try {
            // Lazy load the heavy epub.js library ONLY when a book is opened
            const ePub = (await import('epubjs')).default;
            
            book = ePub(doc.path);
            
            rendition = book.renderTo(viewerRef, {
                width: '100%',
                height: '100%',
                spread: 'none',
                manager: 'continuous',
                flow: 'paginated',
                snap: true
            });
            
            // === PERFECT DARK MODE SYNC ===
            // 1. Grab exact DaisyUI variables dynamically from the current theme
            const dummy = document.createElement('div');
            dummy.className = 'bg-base-100 text-base-content';
            document.body.appendChild(dummy);
            const themeBg = getComputedStyle(dummy).backgroundColor;
            const themeFg = getComputedStyle(dummy).color;
            document.body.removeChild(dummy);

            // 2. Register base theme
            rendition.themes.register('itemlens', {
                'html': { 'background': `${themeBg} !important` },
                'body': { 
                    'background': `${themeBg} !important`, 
                    'color': `${themeFg} !important`,
                    'font-family': 'var(--ep-font) !important',
                    'line-height': '1.6 !important',
                    'padding': '10px !important'
                }
            });
            rendition.themes.select('itemlens');
            rendition.themes.fontSize(`${fontSize}%`);

            // 3. Brute-force override any publisher styles embedded in the EPUB html
            rendition.hooks.content.register((contents: any) => {
                const style = contents.document.createElement('style');
                style.innerHTML = `
                    :root { --ep-font: ${fontFamily}; }
                    html, body { background: ${themeBg} !important; background-color: ${themeBg} !important; color: ${themeFg} !important; font-family: var(--ep-font) !important; }
                    * { color: ${themeFg} !important; background-color: transparent !important; font-family: inherit !important; }
                    a { color: ${themeFg} !important; text-decoration: underline !important; }
                    img { max-width: 100% !important; height: auto !important; border-radius: 8px !important; }
                    svg { max-width: 100% !important; height: auto !important; }
                `;
                contents.document.head.appendChild(style);
            });
            
            // === RESTORE READING POSITION ===
            const savedCfi = localStorage.getItem(`itemlens_epub_cfi_${doc.id || doc.path}`);
            if (savedCfi) {
                await rendition.display(savedCfi);
            } else {
                await rendition.display();
            }
            
            // === LOAD METADATA ===
            book.loaded.navigation.then((nav: any) => {
                // Flatten TOC for mobile-friendly linear lists
                const flatten = (arr: any[], level = 0): any[] => {
                    return arr.reduce((acc, item) => {
                        acc.push({ ...item, level });
                        if (item.subitems?.length) acc.push(...flatten(item.subitems, level + 1));
                        return acc;
                    }, []);
                };
                toc = flatten(nav.toc);
            });

            // Generate locations for exact percentage tracking (this is heavy, so we don't await it to unblock reading)
            book.ready.then(() => {
                return book.locations.generate(1600);
            }).then(() => {
                locationsGenerated = true;
                updateProgress(rendition.currentLocation());
            });
            
            // Pass through tap and swipe events from the iframe to Svelte
            rendition.on('touchstart', handleTouchStart);
            rendition.on('touchend', handleTouchEnd);
            rendition.on('click', handleIframeClick);
            
            // Pass through keyboard events from inside the iframe
            rendition.on('keyup', (e: KeyboardEvent) => {
                if (e.key === 'ArrowRight' || e.key === ' ') nextPage();
                else if (e.key === 'ArrowLeft') prevPage();
                else if (e.key === 'Escape') close();
            });
            
            rendition.on('relocated', (location: any) => {
                if (location && location.start && location.start.cfi) {
                    localStorage.setItem(`itemlens_epub_cfi_${doc.id || doc.path}`, location.start.cfi);
                }
                updateProgress(location);
            });
            
        } catch (e) {
            console.error("Failed to load EPUB:", e);
        } finally {
            loading = false;
        }
    }
    
    function handleIframeLoad() {
        loading = false;
        if (iframeRef) {
            iframeRef.focus();
            iframeRef.contentWindow?.focus();
            try {
                const iframeDoc = iframeRef.contentDocument || iframeRef.contentWindow?.document;
                if (iframeDoc) {
                    iframeDoc.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') close();
                    });

                    // === THE "READING MODE" NUKE ===
                    // Only inject into HTML documents (skip PDFs)
                    const docPath = (doc?.path || doc?.source || '').toLowerCase();
                    if (docPath.endsWith('.html') || docPath.endsWith('.htm')) {
                        const style = iframeDoc.createElement('style');
                        style.innerHTML = `
                            /* Annihilate cookie banners, paywalls, and sticky overlays */
                            [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i],
                            [class*="gdpr" i], [id*="gdpr" i], [class*="popup" i], [id*="popup" i],
                            [class*="newsletter" i], [class*="subscribe" i], [class*="overlay" i],
                            /* Remove sticky headers/footers to give full reading real estate */
                            header, footer, nav, [style*="position: fixed"], [style*="position: sticky"] { display: none !important; }
                            /* Ensure the body actually scrolls and isn't locked by a hidden paywall */
                            body, html { overflow: auto !important; position: static !important; }
                        `;
                        iframeDoc.head.appendChild(style);
                    }
                }
            } catch (err) {
                // Fails silently on secure PDFs or cross-origin URLs
            }
        }
    }

    function updateProgress(location: any) {
        if (!location) return;
        atStart = location.atStart;
        atEnd = location.atEnd;
        
        if (locationsGenerated) {
            progress = Math.round(book.locations.percentageFromCfi(location.start.cfi) * 100);
        }
        
        // Find current chapter from TOC
        if (toc.length > 0) {
            const cleanHref = location.start.href.split('#')[0];
            const chapter = toc.find(item => item.href.includes(cleanHref));
            if (chapter) currentChapter = chapter.label.trim();
        }
    }

    export function close() {
        isOpen = false;
        showToc = false;
        showSettings = false;
        docType = 'none';
        if (book) {
            book.destroy();
            book = null;
            rendition = null;
        }
    }

    // --- Gesture & Navigation ---
    
    function prevPage() { if (rendition) rendition.prev(); resetMenuTimeout(); }
    function nextPage() { if (rendition) rendition.next(); resetMenuTimeout(); }
    
    function toggleMenu() {
        if (docType === 'iframe') return; // Enforce always visible
        showMenu = !showMenu;
        if (showMenu) resetMenuTimeout();
        if (!showMenu) { showToc = false; showSettings = false; }
    }
    
    function resetMenuTimeout() {
        clearTimeout(menuTimeout);
        if (showMenu) {
            menuTimeout = setTimeout(() => showMenu = false, 3500);
        }
    }
    
    function savePrefs() {
        localStorage.setItem('itemlens_epub_prefs', JSON.stringify({ fontSize, fontFamily }));
    }

    function changeFontSize(delta: number) {
        fontSize = Math.max(50, Math.min(250, fontSize + delta));
        if (rendition) rendition.themes.fontSize(`${fontSize}%`);
        savePrefs();
        resetMenuTimeout();
    }
    
    function changeFontFamily(family: string) {
        fontFamily = family;
        if (rendition) {
            rendition.getContents().forEach((c: any) => {
                c.document.documentElement.style.setProperty('--ep-font', family);
            });
        }
        savePrefs();
        resetMenuTimeout();
    }
    
    function goToChapter(href: string) {
        if (rendition) {
            rendition.display(href);
            showToc = false;
            showMenu = false;
        }
    }

    function handleScrub(e: any) {
        if (!locationsGenerated || !book || !rendition) return;
        const pct = parseFloat(e.currentTarget.value) / 100;
        const cfi = book.locations.cfiFromPercentage(pct);
        rendition.display(cfi);
        resetMenuTimeout();
    }

    function handleIframeClick(e: any) {
        const width = window.innerWidth;
        const x = e.clientX;
        if (x < width * 0.25) prevPage();
        else if (x > width * 0.75) nextPage();
        else toggleMenu();
    }

    let touchStartX = 0;
    let touchStartY = 0;
    function handleTouchStart(e: any) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }
    function handleTouchEnd(e: any) {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX > 0) prevPage();
            else nextPage();
        } else if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10) {
            handleIframeClick({ clientX: touchEndX });
        }
    }
    
    function handleGlobalKeydown(e: KeyboardEvent) {
        if (!isOpen) return;
        if (docType === 'iframe') resetMenuTimeout();
        if (e.key === 'Escape') {
            e.preventDefault();
            if (showToc || showSettings) { showToc = false; showSettings = false; }
            else close();
        } else if (e.key === 'ArrowRight' || e.key === ' ') {
            e.preventDefault();
            nextPage();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevPage();
        }
    }
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

{#if isOpen}
    <!-- Main Background (Dimmed to separate the book from the OS layer) -->
    <div 
        bind:this={overlayRef}
        class="fixed inset-0 z-[9999] bg-base-300/95 backdrop-blur-xl flex flex-col overscroll-none touch-none outline-none"
        transition:fade={{ duration: 250, easing: cubicOut }}
        tabindex="-1"
    >
        <!-- === TOP CHROME === -->
        <div 
            class="absolute top-4 inset-x-4 max-w-2xl mx-auto flex justify-between items-center bg-base-200/95 backdrop-blur-xl border border-base-300 shadow-xl rounded-full p-2 z-50 transition-all duration-300"
            class:opacity-0={!showMenu && !showToc && !showSettings}
            class:-translate-y-4={!showMenu && !showToc && !showSettings}
            class:pointer-events-none={!showMenu && !showToc && !showSettings}
        >
        <button class="btn btn-sm btn-ghost rounded-full px-4 font-bold" on:click={close} aria-label="Close">
            Done
            </button>
            
            <div class="flex-1 min-w-0 px-3 text-center">
            <h2 class="font-bold text-sm tracking-tight truncate">{doc?.title || 'Document'}</h2>
            </div>
            
            <div class="flex items-center gap-1">
            {#if docType === 'iframe'}
                <button class="btn btn-circle btn-sm btn-ghost" on:click={() => invertIframe = !invertIframe} title="Toggle Reading Mode">
                    <i class="bi {invertIframe ? 'bi-sun-fill text-warning' : 'bi-moon-fill'} text-lg"></i>
                </button>
            {:else if docType === 'epub'}
                <button class="btn btn-circle btn-sm btn-ghost {showSettings ? 'bg-primary/20 text-primary' : ''}" on:click={() => {showSettings = !showSettings; showToc = false;}} aria-label="Appearance">
                    <span class="font-serif font-bold text-lg leading-none">Aa</span>
                </button>
                <button class="btn btn-circle btn-sm btn-ghost {showToc ? 'bg-primary/20 text-primary' : ''}" on:click={() => {showToc = !showToc; showSettings = false;}} aria-label="Table of Contents">
                    <i class="bi bi-list"></i>
                </button>
            {/if}
            </div>
        </div>

        <!-- === READER CANVAS === -->
        <!-- Floating Page Layout: Constrains height on Desktop, fills screen on mobile -->
        <div class="flex-1 w-full h-full flex items-center justify-center pt-[10vh] pb-[10vh] md:py-8 px-0 md:px-4 relative z-10">
            <div class="w-full h-full max-w-2xl md:max-h-[800px] relative bg-base-100 md:rounded-3xl md:shadow-2xl md:border md:border-base-300 overflow-hidden">
                
                {#if loading}
                    <div class="absolute inset-0 flex items-center justify-center z-10" transition:fade>
                        <span class="loading loading-spinner loading-lg text-primary"></span>
                    </div>
                {/if}
                
                {#if docType === 'epub'}
                    <div bind:this={viewerRef} class="w-full h-full"></div>
                    <!-- Invisible Tap Zones over the EPUB -->
                    <div class="absolute inset-y-0 left-0 w-[30%] z-20 cursor-pointer" on:click={prevPage} aria-label="Previous Page" role="button" tabindex="0"></div>
                    <div class="absolute inset-y-0 right-0 w-[30%] z-20 cursor-pointer" on:click={nextPage} aria-label="Next Page" role="button" tabindex="0"></div>
                    <div class="absolute inset-y-0 left-[30%] right-[30%] z-20 cursor-pointer" on:click={toggleMenu} aria-label="Toggle Menu" role="button" tabindex="0"></div>
                {:else if docType === 'iframe'}
                    <iframe 
                        bind:this={iframeRef}
                        src={doc.path || doc.source} 
                        class="w-full h-full border-none transition-all duration-300 relative z-10"
                        style="background-color: white; filter: {invertIframe ? 'invert(1) hue-rotate(180deg)' : 'none'};"
                        on:load={handleIframeLoad}
                        title="Document Viewer"
                    ></iframe>
                {/if}
            </div>
        </div>
        
        <!-- === BOTTOM CHROME (Progress) === -->
        {#if docType === 'epub'}
        <div 
            class="absolute bottom-4 inset-x-4 max-w-2xl mx-auto flex flex-col justify-center items-center bg-base-200/95 backdrop-blur-xl border border-base-300 shadow-xl rounded-2xl p-4 z-50 transition-all duration-300"
            class:opacity-0={!showMenu && !showToc && !showSettings}
            class:translate-y-4={!showMenu && !showToc && !showSettings}
            class:pointer-events-none={!showMenu && !showToc && !showSettings}
        >
            <div class="w-full flex justify-between text-xs font-semibold text-gray-500 mb-2 px-1">
                <span class="truncate max-w-[70%]">{currentChapter || 'Reading...'}</span>
                <span>{progress}%</span>
            </div>
            <input type="range" min="0" max="100" value={progress} on:change={handleScrub} class="range range-primary range-xs w-full" disabled={!locationsGenerated} />
        </div>
        {/if}
        
        <!-- === TABLE OF CONTENTS DRAWER === -->
        {#if showToc}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="absolute inset-0 bg-base-100/60 backdrop-blur-sm z-[60]" on:click={() => showToc = false} transition:fade={{duration: 200}}></div>
            <div class="absolute top-20 right-4 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 w-80 max-w-[calc(100vw-2rem)] max-h-[60vh] bg-base-100 border border-base-300 shadow-2xl rounded-2xl overflow-hidden z-[70] flex flex-col" transition:fly={{ y: -20, duration: 200 }}>
                <div class="p-4 border-b border-base-200 font-bold tracking-tight bg-base-200/50">Chapters</div>
                <div class="overflow-y-auto flex-1 p-2">
                    {#if toc.length === 0}
                        <div class="p-4 text-center text-sm text-gray-500 italic">No chapters found.</div>
                    {:else}
                        {#each toc as chapter}
                            <button 
                                class="w-full text-left p-3 text-sm hover:bg-primary/10 hover:text-primary rounded-xl transition-colors truncate"
                                style="padding-left: {1 + chapter.level * 1}rem;"
                                class:text-primary={currentChapter === chapter.label.trim()}
                                class:font-bold={currentChapter === chapter.label.trim()}
                                on:click={() => goToChapter(chapter.href)}
                            >
                                {chapter.label.trim()}
                            </button>
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}
        
        <!-- === APPEARANCE DRAWER === -->
        {#if showSettings}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="absolute inset-0 bg-base-100/60 backdrop-blur-sm z-[60]" on:click={() => showSettings = false} transition:fade={{duration: 200}}></div>
            <div class="absolute top-20 right-4 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 w-80 max-w-[calc(100vw-2rem)] bg-base-100 border border-base-300 shadow-2xl rounded-2xl overflow-hidden z-[70] flex flex-col p-4 gap-6" transition:fly={{ y: -20, duration: 200 }}>
                
                <div class="flex flex-col gap-2">
                    <div class="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Font Size</div>
                    <div class="flex items-center gap-3 bg-base-200 p-2 rounded-xl">
                        <button class="btn btn-circle btn-sm btn-ghost" on:click={() => changeFontSize(-10)}><i class="bi bi-dash text-lg"></i></button>
                        <div class="flex-1 text-center font-mono font-bold text-sm">{fontSize}%</div>
                        <button class="btn btn-circle btn-sm btn-ghost" on:click={() => changeFontSize(10)}><i class="bi bi-plus text-lg"></i></button>
                    </div>
                </div>
                
                <div class="flex flex-col gap-2">
                    <div class="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Typography</div>
                    <div class="grid grid-cols-2 gap-2">
                        <button class="btn border-base-300 bg-base-200 font-sans normal-case text-base {fontFamily.includes('sans-serif') ? 'border-primary text-primary bg-primary/10' : ''}" on:click={() => changeFontFamily('system-ui, -apple-system, sans-serif')}>Sans-Serif</button>
                        <button class="btn border-base-300 bg-base-200 font-serif normal-case text-base {fontFamily.includes('Georgia') ? 'border-primary text-primary bg-primary/10' : ''}" on:click={() => changeFontFamily('Georgia, serif')}>Serif</button>
                    </div>
                </div>

            </div>
        {/if}

    </div>
{/if}