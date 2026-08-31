<script lang="ts">
    import { onMount } from 'svelte';

    export let pdfDoc: any;
    export let pageNum: number;
    export let invert: boolean = false;

    let canvas: HTMLCanvasElement;
    let container: HTMLDivElement;
    let isRendered = false;
    let observer: IntersectionObserver;

    onMount(() => {
        // Render 1 viewport ahead to keep scrolling buttery smooth
        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !isRendered) {
                renderPage();
            }
        }, { rootMargin: "100% 0px" });
        
        if (container) observer.observe(container);

        return () => observer?.disconnect();
    });

    async function renderPage() {
        isRendered = true;
        try {
            const page = await pdfDoc.getPage(pageNum);
            
            // Base viewport scale on container width to make it responsive
            const unscaledViewport = page.getViewport({ scale: 1 });
            const containerWidth = container.clientWidth || window.innerWidth;
            
            // Target ~1.5x resolution for Retina crispness without blowing out RAM
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            
            // We want the CSS width to match the container, but the canvas internal resolution to be higher
            const cssScale = containerWidth / unscaledViewport.width;
            const renderScale = cssScale * pixelRatio;
            
            const viewport = page.getViewport({ scale: renderScale });

            canvas.height = viewport.height;
            canvas.width = viewport.width;
            // Force CSS to scale it back down to container size
            canvas.style.width = '100%';
            canvas.style.height = 'auto';

            const renderContext = {
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
        } catch (e) {
            console.error(`Page ${pageNum} render error:`, e);
        }
    }
</script>

<div bind:this={container} class="w-full bg-white shadow-md rounded-lg overflow-hidden relative min-h-[400px] flex items-center justify-center" style={invert ? "filter: invert(1) hue-rotate(180deg);" : ""}>
    {#if !isRendered}
        <span class="loading loading-spinner text-base-content/20 absolute"></span>
    {/if}
    <canvas bind:this={canvas} class="w-full block"></canvas>
</div>