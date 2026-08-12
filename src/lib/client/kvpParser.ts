// src/lib/client/kvpParser.ts

export interface ParsedKVPResult {
    kvps?: { key: string, value: string }[];
    rows?: string[][];
}

export function parsePlainTextKVPs(text: string): ParsedKVPResult | null {
    // 1. Excel / Google Sheets format (TSV)
    if (text.indexOf('\t') !== -1) {
        const rows = text.split('\n')
            .map(r => r.split('\t').map(c => c.trim()))
            .filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
        return { rows };
    }

    // Check which format fits this "paste" best.
    const formats = [
        { func: convertDashKeyColonValueToTable, ratio : isOfTextFormat(text, /^[–|\-|*|#] (.+)[:] (.+)$/g) },
        // Note 'it should not start with' or will always return better than the one above since both will match
        { func: convertKeyColonValueToTable, ratio : isOfTextFormat(text, /^(?![–|\-|\*|#])(.+)[:] (.+)$/g) },
    ];
    formats.sort((a, b) => b.ratio - a.ratio);

    if(formats[0].ratio > 0.5) {
        console.log(`Best matching format (${formats[0].ratio}) is: `, formats[0].func);
        const kvps = formats[0].func(text);
        return { kvps };
    }

    return null;
}

function isOfTextFormat(str: string, regEx: RegExp)
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
function convertDashKeyColonValueToTable(str: string)
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
function convertKeyColonValueToTable(str: string)
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