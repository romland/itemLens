<script>
    let numKVPs = 1;

    function addKVP(ev)
    {
        numKVPs = numKVPs + 1;
        setTimeout(() => {
            document.querySelector('input[name="kvpK-' + (numKVPs-1) + '"]').focus();
        }, 1);
    }

    function removeKVP(ev, ix)
    {
        if(numKVPs > 1) {
            ev.target.parentNode.remove("kvpK-"+ix);
            ev.target.parentNode.remove("kvpV-"+ix);
            numKVPs = numKVPs;
        }
    }
</script>

    {#each {length:numKVPs} as _, i}
        <div>
            <input type="text" name="kvpK-{i}" value="" placeholder="Attribute" class="input input-bordered w-1/3 mb-3">
            <input type="text" name="kvpV-{i}" value="" placeholder="Value" class="input input-bordered w-1/3 mb-3">
            <button on:click={(ev)=>{ removeKVP(ev, i) }} type="button" class="btn btn-warning">-</button>
            {#if i === numKVPs - 1}
                <button on:click={(ev) => {
                    const newI = addKVP(ev);
                }} type="button" class="btn btn-primary">+</button>
            {/if}
        </div>
    {/each}
    <div class="mt-1 text-gray-400 text-xs">
        Attributes, e.g.: weight = 400g, width = 140mm
    </div>
