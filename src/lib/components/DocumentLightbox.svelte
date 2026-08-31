<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    import { tick, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import { notify } from '$lib/client/notifications';
    import GestureShield from './GestureShield.svelte';
    import { marked } from 'marked';
    import { isEpub, isMarkdown, isHtml } from '$lib/shared/fileutils';

    export let isOpen = false;
    let doc: any = null;
    let loading = false;
    let viewerRef: HTMLDivElement;
    let overlayRef: HTMLDivElement;
    let iframeRef: HTMLIFrameElement;
    let docType: 'epub' | 'iframe' | 'markdown' | 'none' = 'none';
    let invertIframe = false;
    let markdownContentHtml = '';
    
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
    let isTurningPage = false;
    let progress = 0;
    let currentChapter = "";
    let toc: any[] = [];
    let locationsGenerated = false;
    
    // Settings
    let fontSize = 100;
    let fontFamily = 'system-ui, -apple-system, sans-serif';

    // Highlight state
    let highlightModal: HTMLDialogElement;
    let pendingHighlight: { text: string, cfiRange: string, chapterText: string } | null = null;
    let isSavingHighlight = false;

    let isMaximized = false;

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
        isMaximized = false;

        const rawPath = doc.path || doc.source || '';
        let path = rawPath.toLowerCase();
        let cfiToJump = null;
        
        // Extract CFI anchor if we jumped here from a Search Result highlight
        if (rawPath.includes('#epubcfi(')) {
            const parts = rawPath.split('#');
            path = parts[0].toLowerCase();
            cfiToJump = parts.slice(1).join('#');
            doc.path = parts[0]; // Mutate locally so epub.js loads the book correctly
        }

        if (isEpub(path)) {
            docType = 'epub';
            resetMenuTimeout();
        } else if (isMarkdown(path) || doc.type === 'note') {
            docType = 'markdown';
            resetMenuTimeout();
            try {
                const res = await fetch(doc.path || doc.source);
                const text = await res.text();
                markdownContentHtml = await marked.parse(text, { breaks: true, gfm: true });
            } catch (e) {
                markdownContentHtml = '<p class="text-error font-bold">Failed to load document.</p>';
            }
        } else if (path.match(/\.(pdf|csv)$/i) || isHtml(path)) {
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
        
        // Check for specific document override
        const override = localStorage.getItem(`itemlens_invert_${doc?.id}`);
        if (override !== null) invertIframe = override === 'true';

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

        if (docType === 'epub') {
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
            if (cfiToJump) {
                await rendition.display(cfiToJump);
            } else if (savedCfi) {
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
            
            // === CONTEXT HIGHLIGHT EXTRACTOR ===
            rendition.on('selected', async (cfiRange: string, contents: any) => {
                const text = rendition.getRange(cfiRange).toString().trim();
                if (!text) return;
                
                const chapterText = contents.document.body.innerText;
                pendingHighlight = { text, cfiRange, chapterText };
                highlightModal.showModal();

                contents.window.getSelection().removeAllRanges();
            });
            
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
        } else {
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
                if (isHtml(docPath)) {
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

    function toggleMaximize() {
        isMaximized = !isMaximized;
        if (docType === 'epub' && rendition) {
            setTimeout(() => rendition.resize(), 300); // Recalculate pagination after CSS transition
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
    const FADE_DURATION = 75; // Fast enough to be snappy, long enough to hide the flash
    
    async function prevPage() { 
        if (!rendition || isTurningPage) return; 
        isTurningPage = true;
        // Wait for the viewer to actually turn invisible before thrashing the DOM
        await new Promise(r => setTimeout(r, FADE_DURATION)); 
        await rendition.prev(); 
        isTurningPage = false;
        resetMenuTimeout(); 
    }
    
    async function nextPage() { 
        if (!rendition || isTurningPage) return; 
        isTurningPage = true;
        // Wait for the viewer to actually turn invisible before thrashing the DOM
        await new Promise(r => setTimeout(r, FADE_DURATION)); 
        await rendition.next(); 
        isTurningPage = false;
        resetMenuTimeout(); 
    }
    
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
        if (!rendition || !book) return;

        const parts = href.split('#');
        const basePath = parts[0];
        const anchor = parts.length > 1 ? '#' + parts.slice(1).join('#') : '';

        let targetHref = href;
        const spine = book.spine.spineItems;

        // If the exact base path isn't in the spine, fuzzy match it before asking epub.js to render
        if (!spine.some((item: any) => item.href === basePath)) {
            const fuzzyMatch = spine.find((item: any) => 
                item.href.endsWith('/' + basePath) || 
                basePath.endsWith('/' + item.href) ||
                item.href.includes(basePath)
            );

            if (fuzzyMatch) {
                targetHref = fuzzyMatch.href + anchor; // Re-attach the sub-section anchor!
            }
        }

        rendition.display(targetHref).catch((err: any) => {
            console.error(`[EPUB Nav] Navigation completely failed for: '${targetHref}'`, err);
            console.table(book.spine.spineItems.map((i: any) => ({ idref: i.idref, href: i.href })));
        });

        showToc = false;
        showMenu = false;
    }

    function handleScrub(e: any) {
        if (!locationsGenerated || !book || !rendition) return;
        const pct = parseFloat(e.currentTarget.value) / 100;
        const cfi = book.locations.cfiFromPercentage(pct);
        rendition.display(cfi);
        resetMenuTimeout();
    }

    function bookmarkCurrentPage() {
        if (!rendition) return;
        const loc = rendition.currentLocation();
        if (!loc || !loc.start) return;
        pendingHighlight = {
            text: "", // Empty text signals this is a page bookmark, not a text highlight
            cfiRange: loc.start.cfi,
            chapterText: currentChapter || 'Saved Location'
        };
        highlightModal.showModal();
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

    async function confirmHighlight() {
        if (!pendingHighlight) return;
        
        const fd = new FormData();
        const content = pendingHighlight.text 
            ? `**Highlight from ${doc.title}:**\n> "${pendingHighlight.text}"`
            : `**Bookmark in ${doc.title}:**\n${currentChapter || 'Saved Location'}`;
            
        fd.append('content', content);
        fd.append('category', 'idea');
        fd.append('preprocessed_docs[]', JSON.stringify({
            title: pendingHighlight.text ? `Highlight: ${doc.title}` : `Bookmark: ${doc.title}`,
            source: doc.title,
            path: `${doc.path}#${pendingHighlight.cfiRange}`,
            extracts: [pendingHighlight.chapterText], // Allows FTS5 to index the entire chapter text around the quote
            type: 'note'
        }));
        if (doc.itemId) fd.append('linkedItemIds[]', doc.itemId.toString());
        
        // Fire and forget, don't await the network
        fetch('/timeline?/capture', { method: 'POST', body: fd, headers: { 'x-sveltekit-action': 'true', 'accept': 'application/json' } })
            .then(() => notify('success', 'Highlight saved to Notebook!'))
            .catch(() => notify('error', 'Failed to save highlight.'));
        
        highlightModal.close();
        pendingHighlight = null;
    }
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

{#if isOpen}
    <!-- Main Background (Dimmed to separate the book from the OS layer) -->
    <div 
        bind:this={overlayRef}
        class="fixed inset-0 z-[9999] bg-base-300/95 backdrop-blur-xl flex flex-col outline-none overscroll-none touch-none overflow-y-scroll"
        transition:fade={{ duration: 250, easing: cubicOut }}
        tabindex="-1"
    >
        <!-- === TOP CHROME === -->
        <div 
            class="absolute top-4 inset-x-4 {isMaximized ? 'max-w-none' : 'max-w-2xl'} mx-auto flex justify-between items-center bg-base-200/95 backdrop-blur-xl border border-base-300 shadow-xl rounded-full p-2 z-50 transition-all duration-300"
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
                <a href={doc?.path || doc?.source} target="_blank" rel="noopener noreferrer" class="btn btn-circle btn-sm btn-ghost bg-base-100/50 hover:bg-base-100 text-base-content shadow-sm mr-1" title="Open Natively">
                    <i class="bi bi-box-arrow-up-right text-lg"></i>
                </a>
            {/if}

            {#if docType === 'iframe'}
                <a href={doc?.path || doc?.source} target="_blank" rel="noopener noreferrer" class="btn btn-circle btn-sm btn-ghost bg-base-100/50 hover:bg-base-100 text-base-content shadow-sm mr-1" title="Open Natively">
                    <i class="bi bi-box-arrow-up-right text-lg"></i>
                </a>
            {/if}

            {#if docType === 'iframe' || docType === 'markdown'}
                <button class="btn btn-circle btn-sm btn-ghost" on:click={() => { invertIframe = !invertIframe; localStorage.setItem(`itemlens_invert_${doc?.id}`, String(invertIframe)); }} title="Toggle Appearance">
                    <i class="bi {invertIframe ? 'bi-sun-fill text-warning' : 'bi-moon-fill'} text-lg"></i>
                </button>
            {:else if docType === 'epub'}
                <button class="btn btn-circle btn-sm btn-ghost" on:click={bookmarkCurrentPage} title="Bookmark Page">
                    <i class="bi bi-bookmark-plus text-lg"></i>
                </button>
                <button class="btn btn-circle btn-sm btn-ghost {showSettings ? 'bg-primary/20 text-primary' : ''}" on:click={() => {showSettings = !showSettings; showToc = false;}} aria-label="Appearance">
                    <span class="font-serif font-bold text-lg leading-none">Aa</span>
                </button>
                <button class="btn btn-circle btn-sm btn-ghost {showToc ? 'bg-primary/20 text-primary' : ''}" on:click={() => {showToc = !showToc; showSettings = false;}} aria-label="Table of Contents">
                    <i class="bi bi-list"></i>
                </button>
            {/if}
                <button class="hidden md:inline-flex btn btn-circle btn-sm btn-ghost" on:click={toggleMaximize} title={isMaximized ? "Restore Size" : "Maximize"}>
                    <i class="bi {isMaximized ? 'bi-arrows-angle-contract' : 'bi-arrows-angle-expand'} text-lg"></i>
                </button>
            </div>
        </div>

        <!-- === READER CANVAS === -->
        <!-- Floating Page Layout: Constrains height on Desktop, fills screen on mobile -->
        <div class="flex-1 w-full h-full flex items-center justify-center pt-[10vh] pb-[10vh] md:py-8 px-0 md:px-4 relative z-10">
            <div class="w-full h-full {isMaximized ? 'max-w-none' : 'max-w-2xl md:max-h-[800px]'} relative bg-base-100 md:rounded-3xl md:shadow-2xl md:border md:border-base-300 overflow-hidden transition-all duration-300">
                
                {#if loading}
                    <div class="absolute inset-0 flex items-center justify-center z-10" transition:fade>
                        <span class="loading loading-spinner loading-lg text-primary"></span>
                    </div>
                {/if}
                
                {#if docType === 'epub'}
                    <GestureShield 
                        active={!showToc && !showSettings && !pendingHighlight} 
                        on:swipeLeft={nextPage}
                        on:swipeRight={prevPage}
                        on:tapLeft={prevPage}
                        on:tapRight={nextPage}
                        on:tapCenter={toggleMenu}
                    />
                    <div 
                        bind:this={viewerRef} 
                        class="w-full h-full epub-viewer transition-opacity duration-75 ease-out"
                        style="opacity: {isTurningPage ? 0 : 1};"
                    ></div>
                {:else if docType === 'iframe'}
                    <iframe 
                        bind:this={iframeRef}
                        src={doc.path || doc.source} 
                        class="w-full h-full border-none transition-all duration-300 relative z-10"
                        style="background-color: white; filter: {invertIframe ? 'invert(1) hue-rotate(180deg)' : 'none'};"
                        on:load={handleIframeLoad}
                        title="Document Viewer"
                    ></iframe>
                {:else if docType === 'markdown'}
                    <div class="w-full h-full overflow-y-auto p-6 sm:p-10 relative z-10 bg-base-100 text-base-content transition-all duration-300"
                         style={invertIframe ? "filter: invert(1) hue-rotate(180deg);" : ""}
                         on:click={(e) => { if(e.target.tagName !== 'A') toggleMenu(); }} role="presentation">
                        <div class="prose prose-sm sm:prose-base max-w-none prose-p:text-base-content prose-headings:text-base-content prose-strong:text-base-content prose-a:text-primary prose-li:text-base-content">
                            {@html markdownContentHtml}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
        
        <!-- === BOTTOM CHROME (Progress) === -->
        {#if docType === 'epub'}
        <div 
            class="absolute bottom-4 inset-x-4 {isMaximized ? 'max-w-none' : 'max-w-2xl'} mx-auto flex flex-col justify-center items-center bg-base-200/95 backdrop-blur-xl border border-base-300 shadow-xl rounded-2xl p-4 z-50 transition-all duration-300"
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

<dialog bind:this={highlightModal} class="modal modal-bottom sm:modal-middle backdrop-blur-sm" on:close={() => pendingHighlight = null}>
    <div class="modal-box p-6 sm:rounded-3xl bg-base-100 shadow-2xl border border-base-200">
        <h3 class="font-bold text-xl mb-4 flex items-center gap-2">
            <i class="bi {pendingHighlight?.text ? 'bi-quote' : 'bi-bookmark'} text-primary"></i> {pendingHighlight?.text ? 'Save Highlight' : 'Save Bookmark'}
        </h3>
        {#if pendingHighlight?.text}
            <blockquote class="border-l-4 border-primary pl-4 text-sm italic text-base-content/80 mb-4 max-h-32 overflow-y-auto">
                "{pendingHighlight.text}"
            </blockquote>
        {:else}
            <div class="bg-base-200 p-4 rounded-xl mb-4 font-medium text-sm flex items-center gap-3">
                <i class="bi bi-pin-map text-primary text-xl"></i> {currentChapter || 'Current Page'}
            </div>
        {/if}
        <p class="text-xs text-gray-500 mb-6 bg-base-200/50 p-3 rounded-xl border border-base-200">
            <i class="bi bi-info-circle mr-1"></i> This and the surrounding pages will be saved to your Notebook. 
            This allows you to search for the context later and jump back exactly to this spot.
        </p>
        <div class="modal-action mt-0 flex gap-2">
            <button type="button" class="btn btn-ghost flex-1 rounded-xl" on:click={() => highlightModal.close()} disabled={isSavingHighlight}>Cancel</button>
            <button type="button" class="btn btn-primary flex-1 rounded-xl shadow-md" on:click={confirmHighlight} disabled={isSavingHighlight}>
                {#if isSavingHighlight}
                    <span class="loading loading-spinner loading-sm"></span> Saving...
                {:else}
                    Save to Notebook
                {/if}
            </button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button disabled={isSavingHighlight}>close</button></form>
</dialog>
{/if}

<style>
    /* Instantly neutralize epub.js default white iframes before hooks run */
    :global(.epub-viewer iframe) {
        background-color: transparent !important;
    }
</style>
