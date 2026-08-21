export const BASE_COLORS_RGB: Record<string, [number, number, number]> = {
    'Red': [255, 0, 0], 'Blue': [0, 0, 255], 'Green': [0, 255, 0], 'Yellow': [255, 255, 0], 'Black': [0, 0, 0], 'White': [255, 255, 255],
    'Grey': [128, 128, 128], 'Brown': [165, 42, 42], 'Beige': [245, 245, 220], 'Purple': [128, 0, 128], 'Pink': [255, 192, 203], 'Orange': [255, 165, 0], 'Navy': [0, 0, 128], 'Teal': [0, 128, 128], 'Metallic': [170, 169, 173], 'Clear': [255, 255, 255]
};

export const BASE_COLORS = Object.keys(BASE_COLORS_RGB);

export function parseColorMix(mix: any): { name: string, pct: number, hex: string }[] {
    if (!mix) return [];
    
    let parsed = mix;
    if (typeof mix === 'string') {
        try {
            parsed = JSON.parse(mix);
        } catch (e) {
            try {
                // Fallback for LLMs outputting single quotes or unquoted keys
                const fixedStr = mix.replace(/'/g, '"').replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
                parsed = JSON.parse(fixedStr);
            } catch(e2) {
                // Extreme fallback: comma-separated list like "Red, Blue"
                if (mix.includes(',')) parsed = mix.split(',').map((s: string) => s.trim());
                else parsed = [mix.trim()];
            }
        }
    }

    let rawEntries: { k: string, v: any }[] = [];
    if (Array.isArray(parsed)) {
        if (typeof parsed[0] === 'string') {
            rawEntries = parsed.map(c => ({ k: c, v: 1 / parsed.length }));
        } else {
            rawEntries = parsed.map(m => {
                // Support multiple formats (LLM's 'color' or previously parsed 'name'/'k')
                const key = m.color || m.name || m.k;
                const val = m.pct ?? m.v ?? m.value;
                if (key && val != null) return { k: key, v: val };
                const entries = Object.entries(m);
                if (entries.length > 0) return { k: entries[0][0], v: entries[0][1] };
                return { k: '', v: 0 };
            });
        }
    } else if (typeof parsed === 'object') {
        rawEntries = Object.entries(parsed).map(([k, v]) => ({ k, v }));
    }

    let total = 0;
    const results = rawEntries.map(({ k, v }) => {
        if (!k) return null;
        let numVal = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.]/g, '')) : Number(v);
        if (isNaN(numVal)) numVal = 1; 
        if (typeof v === 'string' && v.includes('%')) numVal = numVal / 100;
        const val = numVal > 1 ? numVal / 100 : numVal;
        total += val;
        
        // Fuzzy match: Handles "gray"->"grey" and catches "navy blue" -> "navy"
        const normalizedK = k.toLowerCase().trim().replace(/gray/g, 'grey');
        const rgbKey = Object.keys(BASE_COLORS_RGB).find(b => {
            const base = b.toLowerCase();
            return normalizedK === base || normalizedK.includes(base);
        });
        
        const rgb = rgbKey ? BASE_COLORS_RGB[rgbKey] : null;
        if (!rgb) return null; 
        return { name: rgbKey.toLowerCase(), pct: val, hex: '#' + rgb.map(x => Math.round(x).toString(16).padStart(2, '0')).join('') };
    }).filter(e => e && e.pct > 0) as { name: string, pct: number, hex: string }[];

    // Normalize percentages if they don't add up to 1.0 (or 100%)
    if (total > 0 && Math.abs(total - 1) > 0.05) {
        results.forEach(e => e.pct = e.pct / total);
    }
    return results.sort((a, b) => b.pct - a.pct);
}
