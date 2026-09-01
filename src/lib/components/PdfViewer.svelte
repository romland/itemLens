<script lang="ts">
    import { onMount, tick } from 'svelte';
    import PdfPage from './PdfPage.svelte';

    export let url: string;
    export let invert: boolean = false;

    let pdfjsLib: any;
    let pdfDoc: any = null;
    let numPages = 0;
    let loading = true;
    let errorMsg = '';

    let cleanUrl = url;
    let searchQuery = "";
    let exactQuery = "";
    let targetPage = -1;

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

        return () => {
            if (pdfDoc) pdfDoc.destroy();
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
            }
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
