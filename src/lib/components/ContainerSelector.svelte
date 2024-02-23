<script>
    import QRreader from "$lib/components/QRreader.svelte";
    import { createEventDispatcher } from 'svelte'
    const dispatch = createEventDispatcher();

    export let containers = [];
    export let mini = false;

    let scanningContainers = false;
    let addedContainers = [];

    function isValidContainer(txt)
    {
        const containerRegExp = /(^[A-Z])|(\s[0-9]{3})/g
        return containerRegExp.test(txt) || `QR said ${txt}, QR should be ID such as 'B 003'`;
    }

    function scannedContainer(ev, inputEltName)
    {
        const elt = document.getElementById("eltForm").elements[inputEltName];
        const options = Array.from(elt.querySelectorAll('option'));

        const option = options.find(c => c.value === ev.detail);

        if(option.selected === false) {
            addedContainers.push(ev.detail);
            addedContainers = addedContainers;
        }

        option.selected = true;
        dispatch("success", `Added container: ${ev.detail}`);
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
                        <option value="{child.name}" class="ml-4">{child.name}</option>
                    {/each}
                {/if}
            {/each}
        </select>
    </div>
