<script>
    import QRreader from "$lib/components/QRreader.svelte";
    import { createEventDispatcher } from 'svelte'
    const dispatch = createEventDispatcher();

    export let values = [];
    export let containers = [];
    export let mini = false;

    let scanningContainers = false;
    let addedContainers = [];

    import { onMount } from 'svelte'
    
    onMount(async () => {
        if(typeof window !== 'undefined' && values.length) {
            for(let i = 0; i < values.length; i++) {
                console.log("hum:", values[i].containerName);
                scannedContainer({detail: values[i].containerName}, "containers", false);
            }
        }
    });

    function isValidContainer(txt)
    {
        const containerRegExp = /(^[A-Z])|(\s[0-9]{3})/g
        return containerRegExp.test(txt) || `QR said ${txt}, QR should be ID such as 'B 003'`;
    }

    function scannedContainer(ev, inputEltName, notify = true)
    {
        const elt = document.getElementById("eltForm").elements[inputEltName];
        const options = Array.from(elt.querySelectorAll('option'));

        const option = options.find(c => c.value === ev.detail);

        if(!option) {
            console.warn("Undefined container: ", ev.detail);
            return
        }

        if(option.selected === false) {
            addedContainers.push(ev.detail);
            addedContainers = addedContainers;
        }

        option.selected = true;

        if(notify) {
            dispatch("success", `Added container: ${ev.detail}`);
        }
    }

    

</script>

    <!-- Use camera to scan QR codes on containers, results go into a form input -->
    {#if scanningContainers}
        <QRreader validator={isValidContainer} title="Scan QR-code on container" on:scan={(ev) => { scannedContainer(ev, "containers") } } on:stop={()=>{ scanningContainers=false }}></QRreader>
    {/if}

    <button class:disabled={scanningContainers} class="btn btn-primary" type="button" on:click={()=>{scanningContainers=true;}}>
        Scan container (QR)
    </button>

    <div class:hidden={!mini}>
        {#if addedContainers.length > 0}
            <span>Located in:</span>
            {#each addedContainers as container}
                <div class="badge badge-neutral">{container}</div>
            {/each}
        {/if}
    </div>

    <div class:hidden={mini}>
        <select name="containers" class="select select-bordered w-full max-w-xs" multiple="multiple">
            <option value="" disabled selected>Select one or more containers</option>
            {#each containers as container}
                <option value="{container.name}">{container.name}: {container.description}</option>
                {#if container.children.length > 0}
                    {#each container.children as child}
                        <option value="{child.name}" class="ml-4">
                            {child.name}
                            {#if child.description}
                                - {child.description}
                            {/if}
                        </option>
                    {/each}
                {/if}
            {/each}
        </select>
    </div>
