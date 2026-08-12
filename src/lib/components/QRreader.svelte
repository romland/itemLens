<script lang="ts">
    import { Html5Qrcode } from 'html5-qrcode'
    import { onMount } from 'svelte'
    import { createEventDispatcher } from 'svelte'

    let scanning = true;
    let showingError: { message: any } | null = null;
    let scanSuccessResult: string | null = null;
    let isProcessing = false;
    let modal: HTMLDialogElement;
    var html5Qrcode;
    const dispatch = createEventDispatcher();
    export let validator = null;
    export let title = "Scan QR-code"

    onMount(init)

    function init()
    {
        if (typeof window !== 'undefined') {
            html5Qrcode = new Html5Qrcode('reader');
            console.log("Initialized QR reader");
            start();
        }
    }

    function start()
    {
        scanSuccessResult = null;
        isProcessing = false;
        modal.showModal();
        html5Qrcode.start(
            { facingMode: 'environment' },
            {
                fps: 30,
                qrbox: { width: 250, height: 250 },
                showTorchButtonIfSupported: true,
                // aspectRatio: "1.0",
            },
            onScanSuccess,
            onScanFailure
        )
        scanning = true;
    }

    async function stop()
    {
        if (!scanning) return;
        try {
            if (html5Qrcode && html5Qrcode.isScanning) {
                await html5Qrcode.stop();
            }
        } catch(e) { console.warn(e); }
        scanning = false;
        scanSuccessResult = null;
        isProcessing = false;
        modal.close();
        dispatch('stop', { });
    }

    function onScanSuccess(decodedText, decodedResult)
    {
        if (isProcessing) return;
        isProcessing = true;

        let allowed: any = true;

        if(validator) {
            allowed = validator(decodedText);
        }

        if(allowed !== true) {
            if(showingError) {
                isProcessing = false;
                return;
            }

            showingError = { message: allowed };
            setTimeout(() => { showingError = null; isProcessing = false; }, 3000);
            if (navigator.vibrate) navigator.vibrate([50, 100, 50]); // Error haptic
            return;
        }

        // Success feedback!
        scanSuccessResult = decodedText;
        if (navigator.vibrate) navigator.vibrate(150); // Success haptic
        
        try { html5Qrcode.pause(); } catch(e) {}

        setTimeout(() => {
            stop();
            dispatch('scan', decodedText);
        }, 1200); // Wait for animation to finish
    }

    function onScanFailure(error)
    {
        console.warn(`Code scan error = ${error}`);
    }

</script>

<style>
    @keyframes scan-laser {
        0%, 100% { top: 20%; opacity: 0; }
        10%, 90% { opacity: 1; }
        50% { top: 80%; }
    }
    .scan-laser {
        position: absolute;
        left: 15%;
        right: 15%;
        height: 2px;
        background: oklch(var(--p));
        box-shadow: 0 0 15px 4px oklch(var(--p) / 0.6);
        animation: scan-laser 2.5s ease-in-out infinite;
        border-radius: 50%;
    }
    .scale-in-bounce {
        animation: bounce-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
    @keyframes bounce-in {
        0% { transform: scale(0.5); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
    }
    /* Hide html5-qrcode's ugly default border/UI quirks if possible */
    :global(#reader video) {
        border-radius: 1.5rem !important;
        object-fit: cover;
    }
</style>

<dialog bind:this={modal} on:close={()=>stop()} id="modal" class="modal modal-bottom sm:modal-middle backdrop-blur-sm">
  <div class="modal-box sm:rounded-[2.5rem] p-4 sm:p-6 bg-base-100/95 shadow-2xl border border-base-200">
    <div class="flex justify-between items-center mb-4 px-2">
      <h3 class="font-bold text-xl tracking-tight">{title}</h3>
      <button type="button" class="btn btn-sm btn-circle btn-ghost bg-base-200/50" on:click={stop}>✕</button>
    </div>

    <main class="relative w-full rounded-3xl overflow-hidden bg-black shadow-inner aspect-[4/5] sm:aspect-square flex items-center justify-center">
        {#if showingError !== null}
            <div class="absolute top-4 left-4 right-4 z-50 animate-fade-in">
                <div class="alert alert-error shadow-lg rounded-2xl text-white text-sm py-2 bg-error/90 backdrop-blur-md border-none">
                    <i class="bi bi-exclamation-triangle-fill text-lg"></i>
                    <span>{@html showingError.message}</span>
                </div>
            </div>
        {/if}
    
        <reader id="reader" class="w-full h-full object-cover"></reader>

        {#if scanning && !scanSuccessResult}
            <div class="absolute inset-0 z-10 pointer-events-none">
                <div class="scan-laser"></div>
            </div>
        {/if}

        {#if scanSuccessResult}
            <div class="absolute inset-0 bg-success/90 backdrop-blur-md flex flex-col items-center justify-center z-20 animate-fade-in text-success-content p-6 text-center">
                <i class="bi bi-check-circle-fill text-[5rem] mb-4 drop-shadow-xl scale-in-bounce text-white"></i>
                <span class="font-bold text-2xl tracking-tight drop-shadow-md mb-3 text-white">Captured!</span>
                <div class="bg-black/20 text-white/90 px-4 py-2 rounded-xl text-sm font-mono max-w-[80%] truncate shadow-inner border border-white/10">
                    {scanSuccessResult}
                </div>
            </div>
        {/if}
    </main>
  </div>

  <div class="modal-backdrop">
    <button type="button" on:click={stop}>close</button>
  </div>
</dialog>
