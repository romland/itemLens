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

export const isUseless = (s: any) => {
    if (!s) return true;
    const norm = String(s).trim().toLowerCase();
    return norm === 'null' || norm === 'undefined' || norm === 'unknown' || norm === 'n/a' || norm === 'none';
};

export function computeMatch(scanAttributes: Record<string, string>, scanTitle: string, scanRawText: string, dbItem: any, activeSchema: any[], scanCategory?: string): { isMatch: boolean, confidence: number, debugTrace: string[] } {
    let strictFailures = 0;
    let fuzzyMatches = 0;
    let fuzzyMismatches = 0;
    const debugTrace: string[] = [];

    const dbCat = dbItem.photos?.[0]?.category?.name?.toLowerCase();
    const sCat = scanCategory?.toLowerCase();
    if (dbCat && sCat && dbCat !== sCat) {
        return { isMatch: false, confidence: 0, debugTrace: [`[CATEGORY MISMATCH] DB='${dbCat}' != Scan='${sCat}'`] } as any;
    }
    
    // Semantic Reality Check for missing/blank categories (Massager vs Person fix)
    if (!dbCat || !sCat) {
        const normScanTitle = normalizeStr(scanTitle || '');
        const normDbTitle = normalizeStr(dbItem.title || '');
        
        // If we lack category consensus AND the textual titles are vastly different, veto the match immediately.
        // This prevents wildly different objects from matching just because they share a color or brand.
        if (normDbTitle.length > 3 && normScanTitle.length > 3) {
            const titleSim = getSimilarity(normDbTitle, normScanTitle);
            if (titleSim < 0.35) {
                return { isMatch: false, confidence: 0, debugTrace: [`[SEMANTIC VETO] Categories missing/null and titles are entirely different ('${normDbTitle}' vs '${normScanTitle}', sim=${titleSim.toFixed(2)})`] } as any;
            }
        }
    }

    const dbAttributesRaw: Record<string, string> = {};
    if (dbItem.attributes) {
        dbItem.attributes.forEach((attr: any) => { dbAttributesRaw[attr.key] = String(attr.value); });
    }

    if (scanAttributes && Object.keys(scanAttributes).length > 0) {
        for (const field of activeSchema) {
            const rawScanVal = scanAttributes[field.name];
            const rawDbVal = dbAttributesRaw[field.name];

            const normScanVal = isUseless(rawScanVal) ? null : normalizeStr(String(rawScanVal));
            const normDbVal = isUseless(rawDbVal) ? null : normalizeStr(rawDbVal);

            if (field.matchWeight === 'STRICT_DEDUPE') {
                if (rawDbVal && rawScanVal) {
                    // Split RAW values ONLY by commas, preserving full phrases (e.g. "adidas logo" -> "adidaslogo")
                    // This prevents two different brands from matching just because they both contain the word "logo"
                    const dbVals = rawDbVal.split(',').map(normalizeStr).filter(Boolean);
                    const scanVals = String(rawScanVal).split(',').map(normalizeStr).filter(Boolean);
                    const hasIntersection = dbVals.some(v => scanVals.includes(v));
                    
                    if (!hasIntersection && dbVals.length > 0 && scanVals.length > 0) {
                        strictFailures++;
                        debugTrace.push(`[STRICT FAIL] ${field.name}: DB='${rawDbVal}' has no overlap with Scan='${rawScanVal}'`);
                    } else if (hasIntersection) {
                        fuzzyMatches += 2;
                        debugTrace.push(`[STRICT MATCH] ${field.name} overlaps: DB='${rawDbVal}' & Scan='${rawScanVal}'`);
                    }
                } else if (normDbVal && !normScanVal) {
                    strictFailures += 0.5; // Missing a strict DB attribute in the scan weakens confidence
                    debugTrace.push(`[STRICT MISSING] ${field.name}: DB='${normDbVal}', Scan missed it`);
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

    // Only consider attributes that are officially part of our taxonomy/schema.
    // We explicitly ignore injected meta-attributes like "Source Scan" or loose LLM guesses
    // that aren't formally governed by the item's category rules.
    const schemaKeys = new Set(activeSchema.map(f => f.name));
    const scanAttrCount = Object.keys(scanAttributes || {}).filter(k => schemaKeys.has(k) && scanAttributes[k]).length;
    const dbAttrCount = dbItem.attributes?.filter((a: any) => schemaKeys.has(a.key)).length || 0;

    let isMatch = false;
    if (strictFailures >= 1) {
        isMatch = false;
        debugTrace.push(`[RESULT] Failed: strictFailures=${strictFailures}`);
    } else if (scanAttrCount >= 2 && dbAttrCount === 0) {
        isMatch = false;
        debugTrace.push(`[RESULT] Failed: Attribute imbalance (Scan has ${scanAttrCount}, DB has 0)`);
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