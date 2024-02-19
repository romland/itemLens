<script>
    import { Html5Qrcode } from 'html5-qrcode'
    import { onMount } from 'svelte'
    import { createEventDispatcher } from 'svelte'

    let scanning = true;
    let showingError = null;
    var html5Qrcode;
    const dispatch = createEventDispatcher();
    export let validator = null;

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
        modal.showModal();
        html5Qrcode.start(
            { facingMode: 'environment' },
            {
                fps: 10,
                qrbox: { width: 250, height: 200 },
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
        await html5Qrcode.stop();
        scanning = false;
        dispatch('stop', { });
    }

    function onScanSuccess(decodedText, decodedResult)
    {
        let allowed;

        if(validator) {
            allowed = validator(decodedText);
        }

        if(allowed !== true) {
            console.log(allowed);
            if(showingError) {
                return;
            }

            showingError = { message: allowed };
            setTimeout(() => { showingError = null; }, 4000);
            return;
        }

        stop();
        dispatch('scan', decodedText);
    }

    function onScanFailure(error)
    {
        console.warn(`Code scan error = ${error}`);
    }

</script>

<style>
    main {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 20px;
    }
    reader {
        width: 100%;
        min-height: 500px;
        background-color: black;
    }
</style>

<dialog on:close={()=>stop()} on:blur={()=>stop()} id="modal" class="modal">
  <div class="modal-box">
    <form method="dialog">
      <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
    </form>
    <h3 class="font-bold text-lg">Scan QR-code with URL</h3>
    <main class="py-4">
        {#if showingError !== null}
            <div class="toast toast-top toast-start" style="background-color:black;">
                <span>{@html showingError.message}</span>
            </div>
        {/if}
    
        <reader id="reader"/>
    </main>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
