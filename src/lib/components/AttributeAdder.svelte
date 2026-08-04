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
    
    // Modal state
    let showTableModal = false;
    let pendingRows = [];
    let keyColIndex = 0;
    let valColIndex = 1;
    let targetIndex = 0;

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

    function applyKVPs(pastedKVPs, startIndex) {
        if (!pastedKVPs || pastedKVPs.length === 0) return;
        
        numKVPs += pastedKVPs.length - 1;
        
        // TODO: No idea why tick() does not do it for me, doing a setTimeout instead then.
        tick();
        setTimeout(() => {
            for(let i = 0; i < pastedKVPs.length; i++) {
                const kInput = document.querySelector(`input[name="kvpK-${startIndex+i}"]`);
                const vInput = document.querySelector(`input[name="kvpV-${startIndex+i}"]`);
                if (kInput) kInput.value = pastedKVPs[i].key;
                if (vInput) vInput.value = pastedKVPs[i].value;
            }
        }, 10);
    }

    function handleTableConfirm() {
        const pastedKVPs = [];
        for (const row of pendingRows) {
            let keyCell = row[keyColIndex] || "";
            let valueCell = row[valColIndex] || "";
            
            // Remove last character if it's a :
            if (keyCell.endsWith(":")) {
                keyCell = keyCell.slice(0, -1);
            }
            
            if (keyCell.trim() || valueCell.trim()) {
                pastedKVPs.push({ key: keyCell.trim(), value: valueCell.trim() });
            }
        }
        showTableModal = false;
        applyKVPs(pastedKVPs, targetIndex);
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
                "key":   key.slice(2).trim(),
                "value": value.join(':').trim()
            };
        }).filter(kv => kv.key.length > 0 || kv.value.length > 0);
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
                "key":   key.trim(),
                "value": value.join(':').trim()
            };
        }).filter(kv => kv.key.length > 0 || kv.value.length > 0);
        console.log(kvps);
        return kvps;
    }

    function pasteTable(ev, ix)
    {
        let pastedHtml = ev.clipboardData.getData("text/html");
        let pastedText = ev.clipboardData.getData("text/plain");
        let rows = [];

        // Try with a standard paste of a HTML table.
        if (pastedHtml) {
            const docNode = document.createElement("body");
            docNode.innerHTML = pastedHtml;
            const tables = docNode.querySelectorAll("table");
            
            if (tables.length > 0) {
                tables.forEach(table => {
                    table.querySelectorAll("tr").forEach(tr => {
                        const cells = Array.from(tr.querySelectorAll("td, th")).map(c => c.innerText.trim());
                        if (cells.length > 0) rows.push(cells);
                    });
                });
            }
        }

        // Fallback to plain text logic if no valid table structure was found
        if (rows.length === 0 && pastedText) {
            // Excel / Google Sheets format (TSV)
            if (pastedText.indexOf('\t') !== -1) {
                rows = pastedText.split('\n')
                    .map(r => r.split('\t').map(c => c.trim()))
                    .filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
            } else {
                // Check which format fits this "paste" best.
                let formats = [
                    { func: convertDashKeyColonValueToTable, ratio : isOfTextFormat(pastedText, /^[–|\-|*|#] (.+)[:] (.+)$/g) },
                    // Note 'it should not start with' or will always return better than the one above since both will match
                    { func: convertKeyColonValueToTable, ratio : isOfTextFormat(pastedText, /^(?![–|\-|\*|#])(.+)[:] (.+)$/g) },
                ];
                formats.sort((a, b) => b.ratio - a.ratio);

                if(formats[0].ratio > 0.5) {
                    console.log(`Best matching format (${formats[0].ratio}) is: `, formats[0].func);
                    const pastedKVPs = formats[0].func(pastedText);
                    applyKVPs(pastedKVPs, ix);
                    ev.stopPropagation();
                    ev.preventDefault();
                    return;
                }
            }
        }

        if (rows.length > 0) {
            let maxCols = 0;
            rows.forEach(r => maxCols = Math.max(maxCols, r.length));
            
            // Normalize rows so all have same column count
            rows = rows.map(r => {
                while(r.length < maxCols) r.push("");
                return r;
            }).filter(r => r.join("").trim().length > 0);

            if (maxCols > 2) {
                // Launch Interactive Modal for Column Picker
                pendingRows = rows;
                targetIndex = ix;
                keyColIndex = 0;
                valColIndex = 1;
                showTableModal = true;
            } else {
                // Direct import for simple tables
                const pastedKVPs = rows.map(r => {
                    let k = r[0] || "";
                    if (k.endsWith(":")) k = k.slice(0, -1);
                    return { key: k, value: r[1] || "" };
                });
                applyKVPs(pastedKVPs, ix);
            }
            
            ev.stopPropagation();
            ev.preventDefault();
        }
    }

    function handleKeydown(event) {
        if (showTableModal && event.key === 'Escape') {
            showTableModal = false;
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

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
        <strong>Note:</strong> You can paste in HTML tables or Excel/Sheets data and we will import it.
    </div>

<!-- Column Picker Modal -->
<dialog class="modal" class:modal-open={showTableModal}>
    <div class="modal-box max-w-4xl">
        <h3 class="font-bold text-lg mb-4">Select Columns to Import</h3>
        <p class="text-sm mb-4">We detected multiple columns in your pasted data. Please select which one represents the <strong>Attribute</strong> and which is the <strong>Value</strong>.</p>
        
        <div class="overflow-x-auto max-h-96 border border-base-200 rounded-lg">
            <table class="table table-sm table-zebra w-full">
                <thead class="sticky top-0 bg-base-200 z-10">
                    <tr>
                        {#each pendingRows[0] || [] as _, colIndex}
                            <th class="text-center bg-base-200">
                                <div class="flex flex-col gap-2 items-center">
                                    <label class="cursor-pointer flex items-center gap-1">
                                        <input type="radio" name="keyCol" class="radio radio-primary radio-xs" value={colIndex} bind:group={keyColIndex} />
                                        <span class="text-xs">Attribute</span>
                                    </label>
                                    <label class="cursor-pointer flex items-center gap-1">
                                        <input type="radio" name="valCol" class="radio radio-secondary radio-xs" value={colIndex} bind:group={valColIndex} />
                                        <span class="text-xs">Value</span>
                                    </label>
                                </div>
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    {#each pendingRows.slice(0, 10) as row}
                        <tr>
                            {#each row as cell, colIndex}
                                <td class:bg-primary={keyColIndex === colIndex}
                                    class:bg-secondary={valColIndex === colIndex}
                                    class:bg-opacity-10={keyColIndex === colIndex || valColIndex === colIndex}>
                                    <div class="truncate max-w-[150px]" title={cell}>{cell}</div>
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        {#if pendingRows.length > 10}
            <div class="text-xs text-gray-500 mt-2 text-center">Showing first 10 of {pendingRows.length} rows.</div>
        {/if}
        
        <div class="modal-action">
            <button type="button" class="btn" on:click={() => showTableModal = false}>Cancel</button>
            <button type="button" class="btn btn-primary" on:click={handleTableConfirm}>Import</button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button on:click={() => showTableModal = false}>close</button>
    </form>
</dialog>