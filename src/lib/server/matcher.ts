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
    
    const dbAttributes: Record<string, string> = {};
    if (dbItem.attributes) {
        dbItem.attributes.forEach((attr: any) => { dbAttributes[attr.key] = normalizeStr(attr.value); });
    }

    if (scanAttributes && Object.keys(scanAttributes).length > 0) {
        for (const field of activeSchema) {
            const scanVal = scanAttributes[field.name];
            if (!scanVal) continue; // Allow nulls without failing
            
            const normScanVal = normalizeStr(String(scanVal));
            const normDbVal = dbAttributes[field.name];

            if (field.matchWeight === 'STRICT_DEDUPE') {
                if (normDbVal && normDbVal !== normScanVal) strictFailures++;
                else if (normDbVal === normScanVal) fuzzyMatches += 2;
            } else if (field.matchWeight === 'FUZZY_SECONDARY') {
                if (normDbVal === normScanVal) fuzzyMatches++;
            }
        }
    }

    if (strictFailures > 0) return { isMatch: false, confidence: 0 };
    if (fuzzyMatches >= 2) return { isMatch: true, confidence: 0.95 };

    // Textual fallback logic for legacy items without KVPs
    const normScanTitle = normalizeStr(scanTitle || '');
    const normDbTitle = normalizeStr(dbItem.title);
    if (normDbTitle && normScanTitle && normDbTitle === normScanTitle) return { isMatch: true, confidence: 1.0 };
    if (normScanTitle.length > 4 && normDbTitle.includes(normScanTitle)) return { isMatch: true, confidence: 0.85 };
    if (normDbTitle.length > 4 && normScanTitle.includes(normDbTitle)) return { isMatch: true, confidence: 0.85 };

    const textSim = getSimilarity(normDbTitle, normScanTitle);
    if (textSim > 0.8) return { isMatch: true, confidence: textSim };

    return { isMatch: false, confidence: 0 };
}