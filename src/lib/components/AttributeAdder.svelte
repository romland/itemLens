<script lang="ts">
    import { onMount } from 'svelte'
    import { tick }  from 'svelte';

    import { createEventDispatcher } from 'svelte';
    import { parsePlainTextKVPs } from '$lib/client/kvpParser';

    const dispatch = createEventDispatcher();

/*
    WARNING:
    You can not yet put several attribute-adders on the same page as it will all be messed
    up due to input-elements having the same names.
*/

    export let values: any[] = [];

    let numKVPs = 1;
    
    // Modal state
    let showTableModal = false;
    let pendingRows: string[][] = [];
    let keyColIndex = 0;
    let valColIndex = 1;
    let targetIndex = 0;
    let tableModalDialog: HTMLDialogElement;
    let isParsingLLM = false;
    let selectedRows: boolean[] = [];

    $: if (tableModalDialog) {
        if (showTableModal && !tableModalDialog.open) tableModalDialog.showModal();
        if (!showTableModal && tableModalDialog.open) tableModalDialog.close();
    }

    // Automatically initialize row selection state whenever pendingRows updates
    $: if (pendingRows.length > 0 && selectedRows.length !== pendingRows.length) {
        selectedRows = new Array(pendingRows.length).fill(true);
    }

    if(values.length) {
        numKVPs = values.length;
    }

    onMount(async () => {
        if(typeof window !== 'undefined' && values.length) {
            for(let i = 0; i < values.length; i++) {
                const k = document.querySelector(`input[name="kvpK-${i}"]`) as HTMLInputElement | null;
                const v = document.querySelector(`input[name="kvpV-${i}"]`) as HTMLInputElement | null;
                if (k) k.value = values[i].key;
                if (v) v.value = values[i].value;
            }
        }
    });


    function addKVP(ev: Event)
    {
        numKVPs = numKVPs + 1;
        dispatch('change');
        // No idea why tick() does not work, cba to read up on it atm. Doing this:
        setTimeout(() => {
            (document.querySelector('input[name="kvpK-' + (numKVPs-1) + '"]') as HTMLElement | null)?.focus();
        }, 1);
    }

    function removeKVP(ev: any, ix: number)
    {
        if(numKVPs > 1) {
            ev.target.parentNode.remove("kvpK-"+ix);
            ev.target.parentNode.remove("kvpV-"+ix);
            numKVPs = numKVPs;
            dispatch('change');
        }
    }

    function applyKVPs(pastedKVPs: any[], startIndex: number) {
        if (!pastedKVPs || pastedKVPs.length === 0) return;
        
        numKVPs += pastedKVPs.length - 1;
        
        // TODO: No idea why tick() does not do it for me, doing a setTimeout instead then.
        tick();
        setTimeout(() => {
            for(let i = 0; i < pastedKVPs.length; i++) {
                const kInput = document.querySelector(`input[name="kvpK-${startIndex+i}"]`) as HTMLInputElement | null;
                const vInput = document.querySelector(`input[name="kvpV-${startIndex+i}"]`) as HTMLInputElement | null;
                if (kInput) kInput.value = pastedKVPs[i].key;
                if (vInput) vInput.value = pastedKVPs[i].value;
            }
            dispatch('change');
        }, 10);
    }

    function handleTableConfirm() {
        const pastedKVPs = [];
        for (let i = 0; i < pendingRows.length; i++) {
            if (!selectedRows[i]) continue; // Skip unchecked rows
            
            const row = pendingRows[i];
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

    function pasteTable(ev: any, ix: number)
    {
        let pastedHtml = ev.clipboardData.getData("text/html");
        let pastedText = ev.clipboardData.getData("text/plain");
        let rows: string[][] = [];

        // Try with a standard paste of a HTML table.
        if (pastedHtml) {
            const docNode = document.createElement("body");
            docNode.innerHTML = pastedHtml;
            const tables = docNode.querySelectorAll("table");
            
            if (tables.length > 0) {
                tables.forEach(table => {
                    table.querySelectorAll("tr").forEach(tr => {
                        const cells = Array.from(tr.querySelectorAll("td, th")).map(c => (c as HTMLElement).innerText.trim());
                        if (cells.length > 0) rows.push(cells);
                    });
                });
            }
        }

        // Fallback to plain text logic if no valid table structure was found
        if (rows.length === 0 && pastedText) {
            const parsed = parsePlainTextKVPs(pastedText);
            
            if (parsed) {
                if (parsed.kvps) {
                    applyKVPs(parsed.kvps, ix);
                    ev.stopPropagation();
                    ev.preventDefault();
                    return;
                }
                if (parsed.rows) {
                    rows = parsed.rows;
                }
            } else if (pastedText.length > 20) {
                // If local parsers fail, fallback to Gemini LLM for messy PDF/grid data
                isParsingLLM = true;
                ev.stopPropagation();
                ev.preventDefault();
                
                fetch('/api/parse-kvp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: pastedText })
                })
                .then(res => res.json())
                .then(data => {
                    isParsingLLM = false;
                    if (data.success && data.rows && data.rows.length > 0) {
                        let maxCols = 0;
                        data.rows.forEach((r: string[]) => maxCols = Math.max(maxCols, r.length));
                        
                        // Normalize rows so all have same column count
                        const normalizedRows = data.rows.map((r: string[]) => {
                            while(r.length < maxCols) r.push("");
                            return r;
                        }).filter((r: string[]) => r.join("").trim().length > 0);

                        // Trigger the Column Picker Modal seamlessly!
                        pendingRows = normalizedRows;
                        targetIndex = ix;
                        keyColIndex = 0;
                        valColIndex = maxCols > 1 ? 1 : 0;
                        showTableModal = true;
                    } else {
                        alert("Could not automatically parse pasted data.");
                    }
                })
                .catch(() => {
                    isParsingLLM = false;
                    alert("Error reaching LLM.");
                });
                
                return;
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

    function handleKeydown(event: KeyboardEvent) {
        if (showTableModal && event.key === 'Escape') {
            showTableModal = false;
        }
    }
</script>

    <svelte:window onkeydown={handleKeydown} />

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
        {#if isParsingLLM}
            <div class="alert alert-info bg-info/10 text-info border-none shadow-sm mb-3 mt-1 flex gap-3 p-3 rounded-lg">
                <span class="loading loading-spinner loading-sm"></span>
                <span class="font-semibold">Please wait... organizing your pasted data.</span>
            </div>
        {/if}
        Attributes, e.g.: weight = 400g, width = 140mm.<br/>
        <strong>Note:</strong> You can paste in CSV, TSV, HTML tables or Excel/Sheets data and we will import it.
    </div>

<!-- Column Picker Modal -->
<dialog bind:this={tableModalDialog} class="modal" on:close={() => showTableModal = false}>
    <div class="modal-box max-w-4xl">
        <h3 class="font-bold text-lg mb-4">Select Columns to Import</h3>
        <p class="text-sm mb-4">We detected multiple columns in your pasted data. Please select which one represents the <strong>Attribute</strong> and which is the <strong>Value</strong>.</p>
        
        <div class="overflow-x-auto max-h-96 border border-base-200 rounded-lg">
            <table class="table table-sm table-zebra w-full">
                <thead class="sticky top-0 bg-base-200 z-10">
                    <tr>
                        <!-- Master Row Selection Checkbox -->
                        <th class="w-12 text-center bg-base-200">
                            <label class="cursor-pointer flex items-center justify-center" title="Toggle All Rows">
                                <input 
                                    type="checkbox" 
                                    class="checkbox checkbox-xs checkbox-primary" 
                                    checked={selectedRows.length > 0 && selectedRows.every(Boolean)} 
                                    on:change={(e) => {
                                        const checked = (e.currentTarget as HTMLInputElement).checked;
                                        selectedRows = new Array(pendingRows.length).fill(checked);
                                    }} 
                                />
                            </label>
                        </th>                    
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
                    <!-- Render all rows inside the scrollable container -->
                    {#each pendingRows as row, rowIndex}
                        <tr>
                            <td class="text-center bg-base-200/20">
                                <label class="cursor-pointer flex items-center justify-center">
                                    <input type="checkbox" class="checkbox checkbox-xs checkbox-primary" bind:checked={selectedRows[rowIndex]} />
                                </label>
                            </td>
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

        <div class="modal-action">
            <button type="button" class="btn" on:click={() => showTableModal = false}>Cancel</button>
            <button type="button" class="btn btn-primary" on:click={handleTableConfirm}>Import</button>
        </div>
    </div>

    <div class="modal-backdrop">
        <button type="button" on:click={() => showTableModal = false}>close</button>
    </div>    
</dialog>