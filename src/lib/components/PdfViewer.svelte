<script lang="ts">
    import { onMount, tick } from 'svelte';
    import PdfPage from './PdfPage.svelte';

    export let url: string;
    export let invert: boolean = false;
    export let saveKey: string = '';

    let pdfjsLib: any;
    let pdfDoc: any = null;
    let numPages = 0;
    let loading = true;
    let errorMsg = '';

    let cleanUrl = url;
    let searchQuery = "";
    let exactQuery = "";
    let targetPage = -1;

    let observer: IntersectionObserver;
    let visiblePages = new Map();

    // Extract the search query from the URL fragment
    $: {
        if (url.includes('#search=')) {
            const parts = url.split('#search=');
            cleanUrl = parts[0];
            if (parts[1].includes('&exact=')) {
                const subParts = parts[1].split('&exact=');
                searchQuery = decodeURIComponent(subParts[0]).toLowerCase().trim();
                exactQuery = decodeURIComponent(subParts[1]).toLowerCase().trim();
            } else {
                searchQuery = decodeURIComponent(parts[1]).toLowerCase().trim();
                exactQuery = searchQuery;
            }
            console.log(`[DEBUG-PDF] Context: "${searchQuery}" | Exact: "${exactQuery}"`);
        } else if (url.includes('#page=')) {
            const parts = url.split('#page=');
            cleanUrl = parts[0];
            targetPage = parseInt(parts[1], 10) || -1;
            searchQuery = "";
            exactQuery = "";
        } else {
            cleanUrl = url;
            searchQuery = "";
            exactQuery = "";
            console.log(`[DEBUG-PDF] No search query found in URL: ${url}`);
        }
    }

    onMount(() => {
        // Load PDF.js from CDN dynamically to completely sidestep Vite worker config hell
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = initPdf;
        document.head.appendChild(script);

        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                visiblePages.set(entry.target.id, entry.intersectionRatio);
            });
            let bestPage = -1;
            let bestRatio = 0;
            visiblePages.forEach((ratio, id) => {
                if (ratio > bestRatio) {
                    bestRatio = ratio;
                    bestPage = parseInt(id.replace('pdf-page-', ''), 10);
                }
            });

            // Prevent overwriting the user's saved page if they are just viewing a search result
            if (searchQuery) return;

            if (bestPage !== -1 && saveKey) {
                localStorage.setItem(saveKey, bestPage.toString());
            }
        }, { threshold: [0.1, 0.3, 0.5, 0.8] });

        return () => {
            if (pdfDoc) pdfDoc.destroy();
            observer?.disconnect();
        };
    });

    async function initPdf() {
        pdfjsLib = (window as any)['pdfjs-dist/build/pdf'];
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        try {
            pdfDoc = await pdfjsLib.getDocument(cleanUrl).promise;
            numPages = pdfDoc.numPages;
            loading = false;

            if (searchQuery) {
                console.log(`[DEBUG-PDF] PDF Loaded (${numPages} pages). Starting search for: "${searchQuery}"`);
                findAndScrollToQuery();
            } else if (targetPage > 0) {
                await tick();
                setTimeout(() => {
                    const el = document.getElementById(`pdf-page-${targetPage}`);
                    if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
                }, 100);
            }

            await tick();
            document.querySelectorAll('[id^="pdf-page-"]').forEach(el => observer.observe(el));
        } catch (e: any) {
            console.error("PDF Load Error", e);
            errorMsg = e.message || "Failed to load PDF.";
            loading = false;
        }
    }

    async function findAndScrollToQuery() {
        if (!pdfDoc) return;
        
        const cleanContext = searchQuery.replace(/[^a-z0-9]/g, '');
        const cleanExact = exactQuery.replace(/[^a-z0-9]/g, '');
        if (!cleanContext && !cleanExact) return;

        let bestPageByContext = -1;
        let bestPageByExact = -1;

        /*
         * TWO-PASS PDF TEXT SEARCH
         * PDF.js extracts text with unpredictable spaces, hyphens, and rendering artifacts.
         * To guarantee a match, we strip all non-alphanumeric chars from both the PDF text and our queries.
         * 
         * 1. Try to find the full contextual sentence (to avoid false positives).
         * 2. If layout artifacts broke the sentence, fallback to the exact FTS5 matched word.
         */

        // Scan the PDF internally for the target text
        for (let i = 1; i <= numPages; i++) {
            try {
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();
                
                // Reconstruct raw text from PDF text layers
                const pageText = textContent.items.map((s: any) => s.str).join(' ').toLowerCase().replace(/\s+/g, ' ');
                const cleanPageText = pageText.replace(/[^a-z0-9]/g, '');

                // 1. Check for the full context sentence (most accurate)
                if (cleanContext && cleanContext.length > 5 && cleanPageText.includes(cleanContext)) {
                    bestPageByContext = i;
                    break; // Perfect match found, stop searching
                }
                
                // 2. Fallback tracking: track the first page containing the exact FTS5 word
                if (bestPageByExact === -1 && cleanExact && cleanPageText.includes(cleanExact)) {
                    bestPageByExact = i;
                }
            } catch (err) {
                console.error("Error searching PDF page", i, err);
            }
        }

        targetPage = bestPageByContext !== -1 ? bestPageByContext : bestPageByExact;

        if (targetPage !== -1) {
            console.log(`[DEBUG-PDF] 🎯 MATCH FOUND on Page ${targetPage} (via ${bestPageByContext !== -1 ? 'Context' : 'Exact Word'})`);
            await tick();
            setTimeout(() => {
                const el = document.getElementById(`pdf-page-${targetPage}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        } else {
            console.log(`[DEBUG-PDF] ❌ No match found.`);
        }
    }

    // Reactive scroll for external page jumps (like the Resume Reading Breadcrumb)
    $: if (targetPage > 0 && !loading && !searchQuery) {
        tick().then(() => {
            const el = document.getElementById(`pdf-page-${targetPage}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
</script>

<div class="w-full h-full overflow-y-auto overflow-x-hidden bg-base-300 p-2 sm:p-4" style="-webkit-overflow-scrolling: touch;">
    {#if loading}
        <div class="flex flex-col items-center justify-center h-full gap-3 text-base-content/50">
            <span class="loading loading-spinner loading-lg text-primary"></span>
            <span class="text-sm font-semibold">Loading Document Engine...</span>
        </div>
    {:else if errorMsg}
        <div class="flex flex-col items-center justify-center h-full gap-3 text-error">
            <i class="bi bi-exclamation-triangle text-4xl"></i>
            <span class="text-sm font-semibold">{errorMsg}</span>
        </div>
    {:else}
        <div class="max-w-4xl mx-auto flex flex-col gap-2 sm:gap-4 pb-20">
            {#each Array(numPages) as _, i}
                <PdfPage {pdfDoc} pageNum={i + 1} {invert} isTarget={targetPage === i + 1} />
            {/each}
        </div>
    {/if}
</div>
