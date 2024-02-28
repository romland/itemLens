<script>
    import { onMount } from 'svelte'
    import { tick }  from 'svelte';

/*
    WARNING:
    You can not yet put several attribute-adders on the same page as it will all be messed
    up due to input-elements having the same names.
*/

    export let values = [];

    let numKVPs = 1;
    
    if(values.length) {
        numKVPs = values.length;
    }

    onMount(async () => {
        if(typeof window !== 'undefined' && values.length) {
            for(let i = 0; i < values.length; i++) {
                document.querySelector(`input[name="kvpK-${i}"]`).value = values[i].key;
                document.querySelector(`input[name="kvpV-${i}"]`).value = values[i].value;
            }
        }
    });


    function addKVP(ev)
    {
        numKVPs = numKVPs + 1;
        // No idea why tick() does not work, cba to read up on it atm. Doing this:
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

    function pasteHTML(pasted, valueCellIndex = 1)
    {
        const pastedKVPs = [];

        const docNode = document.createElement("body");
        docNode.innerHTML = pasted;
        const tables = docNode.querySelectorAll("table");

        if(tables.length === 0) {
            console.warn("Pasted is not a table", pasted);
            return null;
        }

        console.log(pasted);
        let tr = [];

        // Allow for multiple tables
        for(let i = 0; i < tables.length; i++) {
            tr = [...tr, ...tables[i].querySelectorAll("tr")]
        }

        if(tr.length > 0) {
            const cellCount = tr[0].querySelectorAll("td,th").length;

            if(cellCount > 2) {
                // TODO: Replace this with a more HTML-y solution which show what is in which column.
                const promptRes = prompt(`There are more than two columns.\n\nSelect which column contains the value (2-${cellCount}).\nDefault is taking second column (2).`);
                valueCellIndex = parseInt(promptRes, 10);
                if((""+valueCellIndex) !== promptRes) {
                    console.warn("Invalid column index, taking default: 1 (second column)");
                    valueCellIndex = 1;
                } else {
                    // reduce one (since we asked for +1 (first col is key))
                    valueCellIndex--;
                }
            }
        }

        for(let i = 0; i < tr.length; i++) {
            const td = tr[i].querySelectorAll("td,th");

            // We accept more than 2 cells, but will only take data from first two.
            if(td.length < 2) {
                console.warn(`A row did not have two cells (had ${td.length}):`, tr[i]);
                continue;
            }

            // TODO: We probably need to remove pointless stuff here like tooltips,
            // Like at e.g. tweakers.net: https://tweakers.net/pricewatch/1562568/raspberry-pi-4-model-b-8gb-ram/specificaties/
            let keyCell = td[0].innerText || "";
            const valueCell = td[valueCellIndex].innerText || "";

            // Remove last character if it's a :
            if(keyCell.length > 0 && keyCell.endsWith(":")) {
                keyCell = keyCell.slice(0, -1);
            }

            if(keyCell.length === 0 && valueCell.length === 0) {
                console.warn("Skipping empty row", tr[i]);
                continue;
            }

            if(valueCell.length === 0) {
                // Probably some kind of header.
                console.warn("Skipping header-type");
                continue;
            }

            // Let's assume that if we do not have a key, the value should go on previous item.
            if(keyCell.length === 0 && pastedKVPs.length > 0 && pastedKVPs[pastedKVPs.length-1].key.length > 0) {
                // Did not have a key
                pastedKVPs[pastedKVPs.length-1].value += "\n" + valueCell;
            } else {
                // We had a key and a value
                pastedKVPs.push({
                    key: keyCell,
                    value: valueCell
                });
            }
        }

        if(pastedKVPs.length === 0) {
            console.warn("No valid KVPs found in pasted table");
            return null;
        }

        return pastedKVPs;
    }

    function isOfTextFormat(str, regEx)
    {
        str = str.replaceAll("\r\n", "\n");
        const lines = str.split("\n");

        if(lines.length === 0) {
            return 0;
        }

        let matches = 0;
        for(let i = 0; i < lines.length; i++) {
            if(regEx.test(lines[i].trim())) {
                matches++;
            // } else {
            //     console.log("no match:", lines[i])
            }
            regEx.lastIndex = 0;
        }

        return matches / lines.length;
    }


    /**
       this format seems ... somewhat common:
        – = NOT -

        – Clock Speed: 80MHz/160MHz
        – Flash: 4M bytes
        – Microcontroller: ESP-8266EX
        – Operating Voltage: 3.3V
        – Digital I/O Pins: 11
        – Analog Input Pins: 1(Max input: 3.2V)
        – Lengte: 34.2mm
        – Breedte: 25.6mm
        – Gewicht: 10g
    */
    function convertDashKeyColonValueToTable(str)
    {
        str = str.replaceAll("\r\n", "\n");

        // Trim first two characters (slice), split by \n and :
        const kvps = str.split('\n').map(item => {
            const [key, ...value] = item.split(':');
            return {
                "key":   [key.slice(2).trim()],
                "value": value.join(':').trim()
            };
        });
        console.log(kvps);
        return kvps;
    }


    /**
        Clock Speed: 80MHz/160MHz
        Flash: 4M bytes
        Microcontroller: ESP-8266EX
        Operating Voltage: 3.3V
        Digital I/O Pins: 11
        Analog Input Pins: 1(Max input: 3.2V)
        Lengte: 34.2mm
        Breedte: 25.6mm
        Gewicht: 10g

        --- AND ---

        Sensor: Sony IMX219
        Resolution: 3280 × 2464 (per camera)
        Lens specifications:

            CMOS size: 1/4inch
            Focal Length: 2.6mm
            Angle of View: 83/73/50 degree (diagonal/horizontal/vertical)
            Distortion: <1%
            Baseline Length: 60mm
    */
    function convertKeyColonValueToTable(str)
    {
        str = str.replaceAll("\r\n", "\n");

        const kvps = str.split('\n').map(item => {
            const [key, ...value] = item.split(':');
            return {
                "key":   [key.trim()],
                "value": value.join(':').trim()
            };
        });
        console.log(kvps);
        return kvps;
    }

    function pasteTable(ev, ix)
    {

        // Try with a standard paste of a HTML table.
        let pasted = ev.clipboardData.getData("text/html");
        let pastedKVPs = pasteHTML(pasted);

        /*
        if(!pasted || pasted.length === 0) {
            pasted = ev.clipboardData.getData("application/pdf");
            console.log("PDF fragment:", pasted);
            throw "TODO: Never seen this... PDF? I always got text in Firefox"
        }
        */

        if(!pastedKVPs || pastedKVPs.length === 0) {
            pasted = ev.clipboardData.getData("text/plain");
            console.log(pasted);

            // Check which format fits this "paste" best.
            let formats = [
                { func: convertDashKeyColonValueToTable, ratio : isOfTextFormat(pasted, /^[–|\-|*|#] (.+)[:] (.+)$/g) },
                // Note 'it should not start with' or will always return better than the one above since both will match
                { func: convertKeyColonValueToTable, ratio : isOfTextFormat(pasted, /^(?![–|\-|\*|#])(.+)[:] (.+)$/g) },
            ];
            formats.sort((a, b) => b.ratio - a.ratio);

            if(formats[0].ratio > 0.5) {
                console.log(`Best matching format (${formats[0].ratio}) is: `, formats[0].func);

                // For future reference, if truly complex format: The easiest would be to convert it to HTML tables, so as to not duplicate that effort.
                pastedKVPs = formats[0].func(pasted);
            } else {
                pastedKVPs = []
            }
        }

        if(pastedKVPs && pastedKVPs.length > 0) {
            const startKVPinputId = parseInt(ev.target.name.split("-")[1]);
            numKVPs += pastedKVPs.length - 1;

            // TODO: No idea why tick() does not do it for me, doing a setTimeout instead then.
            tick();
            setTimeout(() => {
                for(let i = 0; i < pastedKVPs.length; i++) {
                    document.querySelector(`input[name="kvpK-${startKVPinputId+i}"]`).value = pastedKVPs[i].key;
                    document.querySelector(`input[name="kvpV-${startKVPinputId+i}"]`).value = pastedKVPs[i].value;
                }
            }, 1);

            ev.stopPropagation();
            ev.preventDefault();
        }
    }
</script>

    {#each {length:numKVPs} as _, i}
        <div>
            <input on:paste={(ev)=>pasteTable(ev, i)} type="text" name="kvpK-{i}" value="" placeholder="Attribute" class="input input-bordered w-1/3 mb-3">
            <input on:paste={(ev)=>pasteTable(ev, i)} type="text" name="kvpV-{i}" value="" placeholder="Value" class="input input-bordered w-1/3 mb-3">
            <button on:click={(ev)=>{ removeKVP(ev, i) }} type="button" class="btn btn-warning">-</button>
            {#if i === numKVPs - 1}
                <button on:click={(ev) => {
                    const newI = addKVP(ev);
                }} type="button" class="btn btn-primary">+</button>
            {/if}
        </div>
    {/each}
    <div class="mt-1 text-gray-400 text-xs">
        Attributes, e.g.: weight = 400g, width = 140mm.<br/>
        <strong>Note:</strong> You can paste in HTML tables and we will clean up the data.
    </div>
