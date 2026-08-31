<script lang="ts">
    import { onMount } from 'svelte';
    import PdfPage from './PdfPage.svelte';

    export let url: string;
    export let invert: boolean = false;

    let pdfjsLib: any;
    let pdfDoc: any = null;
    let numPages = 0;
    let loading = true;
    let errorMsg = '';

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
            pdfDoc = await pdfjsLib.getDocument(url).promise;
            numPages = pdfDoc.numPages;
            loading = false;
        } catch (e: any) {
            console.error("PDF Load Error", e);
            errorMsg = e.message || "Failed to load PDF.";
            loading = false;
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
                <PdfPage {pdfDoc} pageNum={i + 1} {invert} />
            {/each}
        </div>
    {/if}
</div>