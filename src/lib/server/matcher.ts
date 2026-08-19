export const normalizeStr = (s: string) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '').trim();

export function getSimilarity(s1: string, s2: string): number {
    if (!s1 || !s2) return 0.0;
    if (s1 === s2) return 1.0;
    const len1 = s1.length, len2 = s2.length;
    if (!len1 || !len2) return 0.0;
    const dp = Array.from({length: len1 + 1}, () => new Array(len2 + 1).fill(0));
    for (let i = 0; i <= len1; i++) dp[i][0] = i;
    for (let j = 0; j <= len2; j++) dp[0][j] = j;
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i-1] === s2[j-1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
        }
    }
    return 1 - (dp[len1][len2] / Math.max(len1, len2));
}

export function computeMatch(scanAttributes: Record<string, string>, scanTitle: string, scanRawText: string, dbItem: any, activeSchema: any[]): { isMatch: boolean, confidence: number } {
    let strictFailures = 0;
    let fuzzyMatches = 0;
    let fuzzyMismatches = 0;
    const debugTrace: string[] = [];


    const dbAttributes: Record<string, string> = {};
    if (dbItem.attributes) {
        dbItem.attributes.forEach((attr: any) => { dbAttributes[attr.key] = normalizeStr(attr.value); });
    }

    if (scanAttributes && Object.keys(scanAttributes).length > 0) {
        for (const field of activeSchema) {
            const scanVal = scanAttributes[field.name];

            const normScanVal = scanVal ? normalizeStr(String(scanVal)) : null;
            const normDbVal = dbAttributes[field.name];

            if (field.matchWeight === 'STRICT_DEDUPE') {
                if (normDbVal && normScanVal && normDbVal !== normScanVal) {
                    strictFailures++;
                    debugTrace.push(`[STRICT FAIL] ${field.name}: DB='${normDbVal}' != Scan='${normScanVal}'`);
                } else if (normDbVal && !normScanVal) {
                    strictFailures += 0.5; // Missing a strict DB attribute in the scan weakens confidence
                    debugTrace.push(`[STRICT MISSING] ${field.name}: DB='${normDbVal}', Scan missed it`);
                } else if (normDbVal && normScanVal && normDbVal === normScanVal) {
                    fuzzyMatches += 2;
                    debugTrace.push(`[STRICT MATCH] ${field.name} == '${normDbVal}'`);
                }
            } else if (field.matchWeight === 'FUZZY_SECONDARY') {
                if (normDbVal && normScanVal && normDbVal === normScanVal) {
                    fuzzyMatches++;
                    debugTrace.push(`[FUZZY MATCH] ${field.name} == '${normDbVal}'`);
                } else if (normDbVal && normScanVal && normDbVal !== normScanVal) {
                    fuzzyMismatches++;
                    debugTrace.push(`[FUZZY MISMATCH] ${field.name}: DB='${normDbVal}' != Scan='${normScanVal}'`);
                }
            }
        }
    }

    let isMatch = false;
    if (strictFailures >= 1) {
        isMatch = false;
        debugTrace.push(`[RESULT] Failed: strictFailures=${strictFailures}`);
    } else if (fuzzyMismatches >= 2) {
        isMatch = false;
        debugTrace.push(`[RESULT] Failed: fuzzyMismatches=${fuzzyMismatches}`);
    } else if (fuzzyMatches >= 3 && fuzzyMismatches === 0) {
        isMatch = true;
        debugTrace.push(`[RESULT] Pass: Strong fuzzy match (${fuzzyMatches} matches)`);
    } else if (fuzzyMatches >= 4) {
        isMatch = true;
        debugTrace.push(`[RESULT] Pass: Overwhelming fuzzy match (${fuzzyMatches} matches, ${fuzzyMismatches} mismatches)`);
    } else {
        // Textual fallback logic for legacy items without KVPs
        const normScanTitle = normalizeStr(scanTitle || '');
        const normDbTitle = normalizeStr(dbItem.title);

        // Ignore placeholders
        const isGenericTitle = normScanTitle.includes("new item") || normScanTitle.includes("default product") || normScanTitle.includes("unknown") || normDbTitle.includes("new item") || normDbTitle.includes("default product") || normDbTitle.includes("unknown");

        if (!isGenericTitle && normDbTitle && normScanTitle) {
            if (normDbTitle === normScanTitle) {
                isMatch = true;
                debugTrace.push(`[TEXT MATCH] Exact Title: '${normDbTitle}'`);
            } else {
                const textSim = getSimilarity(normDbTitle, normScanTitle);
                if (textSim > 0.85) {
                    isMatch = true;
                    debugTrace.push(`[TEXT MATCH] Sim=${textSim.toFixed(2)}`);
                } else if (normScanTitle.length > 5 && normDbTitle.includes(normScanTitle)) {
                    isMatch = true;
                    debugTrace.push(`[TEXT MATCH] Scan title inside DB title`);
                } else if (normDbTitle.length > 5 && normScanTitle.includes(normDbTitle)) {
                    isMatch = true;
                    debugTrace.push(`[TEXT MATCH] DB title inside Scan title`);
                }
            }
        }
    }

    // Cast as any because previous files using it expect exactly { isMatch, confidence }. Adding debugTrace is safe as long as we type-cast locally where used.
    return { isMatch, confidence: isMatch ? 0.95 : 0, debugTrace } as any;
}