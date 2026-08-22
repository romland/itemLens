import { BASE_COLORS_RGB, parseColorMix } from '$lib/shared/colors';
import { tokenizeAndStem } from '$lib/server/nlp';
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

function rgbToLab(rgb: [number, number, number]): [number, number, number] {
    let r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    
    x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
    y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
    z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
    
    return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)];
}

function colorDistance(c1: string, c2: string): number {
    const rgb1 = Object.entries(BASE_COLORS_RGB).find(([k]) => k.toLowerCase() === c1.toLowerCase())?.[1];
    const rgb2 = Object.entries(BASE_COLORS_RGB).find(([k]) => k.toLowerCase() === c2.toLowerCase())?.[1];
    if (!rgb1 || !rgb2) return 1; // max distance if unknown
    
    /*
    // Calculate Euclidean distance. Max distance in 3D RGB space is sqrt(255^2 * 3) ~= 441.67
    const dist = Math.sqrt(Math.pow(rgb1[0]-rgb2[0], 2) + Math.pow(rgb1[1]-rgb2[1], 2) + Math.pow(rgb1[2]-rgb2[2], 2));
    return dist / 441.67;
    */

    // Convert to CIELAB space and calculate Delta E (CIE76 visual distance metric)
    const lab1 = rgbToLab(rgb1);
    const lab2 = rgbToLab(rgb2);
    const deltaE = Math.sqrt(Math.pow(lab1[0]-lab2[0], 2) + Math.pow(lab1[1]-lab2[1], 2) + Math.pow(lab1[2]-lab2[2], 2));
    
    // A Delta E of ~50+ represents completely different colors to the human eye.
    // We use a slight curve to aggressively penalize visual mismatches.
    return Math.min(1.0, Math.pow(deltaE / 50.0, 1.5));
}

function calculateColorMixSimilarity(mixAStr: string | any, mixBStr: string | any): number {
    const mixA = parseColorMix(mixAStr);
    const mixB = parseColorMix(mixBStr);
    if (!mixA.length || !mixB.length) return 0;

    const remA: Record<string, number> = {};
    const remB: Record<string, number> = {};

    mixA.forEach(m => remA[m.name] = m.pct);
    mixB.forEach(m => remB[m.name] = m.pct);

    let similarity = 0;
    // 1. Exact matches (Intersection of identical keys)
    for (const color of Object.keys(remA)) {
        if (remB[color]) {
            const overlap = Math.min(remA[color], remB[color]);
            similarity += overlap;
            remA[color] -= overlap;
            remB[color] -= overlap;
        }
    }

    // 2. Greedy soft matches (Euclidean Distance on remainder)
    const keysA = Object.keys(remA).filter(k => remA[k] > 0);
    const keysB = Object.keys(remB).filter(k => remB[k] > 0);
    for (const cA of keysA) {
        for (const cB of keysB) {
            if (remA[cA] > 0 && remB[cB] > 0) {
                const matchSim = 1 - colorDistance(cA, cB);
                // Only pair if they are reasonably close (e.g. Navy and Blue)
                if (matchSim > 0.5) { 
                    const overlap = Math.min(remA[cA], remB[cB]);
                    similarity += overlap * matchSim;
                    remA[cA] -= overlap;
                    remB[cB] -= overlap;
                }
            }
        }
    }
    return similarity;
}

export const isUseless = (s: any) => {
    if (!s) return true;
    if (typeof s === 'object') return Object.keys(s).length === 0;
    if (String(s) === '[object Object]') return true;
    const norm = String(s).trim().toLowerCase();
    if (norm === '{}') return true;
    return norm === 'null' || norm === 'undefined' || norm === 'unknown' || norm === 'n/a' || norm === 'none';
};

export function computeIdfMap(dbItems: any[]): Map<string, number> {
    const idfMap = new Map<string, number>();
    const dfMap = new Map<string, number>();
    const totalDocs = dbItems.length;
    dbItems.forEach(item => {
            let tokens: string[] = [];
            if (item.semanticTokens) {
                try { tokens = JSON.parse(item.semanticTokens); } catch(e) {}
            }
            const graphic = item.attributes?.find((a: any) => a.key === 'prominent_text_or_graphic')?.value;
            const wear = item.attributes?.find((a: any) => a.key === 'distinctive_blemishes_or_wear')?.value;
            
            const extraTokens = tokenizeAndStem([graphic, wear]);
            const uniqueTokens = new Set<string>([...tokens, ...extraTokens]);
            
            uniqueTokens.forEach(t => dfMap.set(t, (dfMap.get(t) || 0) + 1));
    });
    dfMap.forEach((df, token) => idfMap.set(token, Math.log((totalDocs + 1) / (df + 1)) + 1));
    return idfMap;
}

function calculateWeightedJaccard(tokensA: string[], tokensB: string[], idfMap: Map<string, number>): number {
    if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
    let intersection = 0, union = 0;
    const unique = new Set([...tokensA, ...tokensB]);
    for (const t of unique) {
        const w = idfMap.get(t) || 1.0;
        union += w;
        if (tokensA.includes(t) && tokensB.includes(t)) intersection += w;
    }
    return union > 0 ? intersection / union : 0;
}

export interface ScanContext {
    tokens: string[];
    colorMix: any;
    title: string;
    description: string;
    rawText: string;
    category?: string;
    prominentTextOrGraphic?: string | null;
    distinctiveWear?: string | null;
}

export function computeMatch(
    scan: ScanContext,
    dbItem: any, 
    idfMap: Map<string, number>, 
): { isMatch: boolean, confidence: number, score: number, debugTrace: string[], sharedAttributes: {key: string, value: string}[] } {
    let strictFailures = 0;
    let fuzzyMatches = 0;
    let fuzzyMismatches = 0;
    const debugTrace: string[] = [];
    const sharedAttributes: { key: string, value: string }[] = [];

    const dbCat = dbItem.photos?.[0]?.category?.name?.toLowerCase();
    const sCat = scan.category?.toLowerCase();
    if (dbCat && sCat && dbCat !== sCat) {
        return { isMatch: false, confidence: 0, debugTrace: [`[CATEGORY MISMATCH] DB='${dbCat}' != Scan='${sCat}'`] } as any;
    }
    
    if (!dbCat || !sCat) {
        const normScanTitle = normalizeStr(scan.title || '');
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

    // Color Mix Gate
    const dbColorAttr = dbItem.attributes?.find((a: any) => a.key === 'color_mix')?.value;
    if (dbColorAttr && scan.colorMix) {
        const sim = calculateColorMixSimilarity(dbColorAttr, typeof scan.colorMix === 'string' ? scan.colorMix : JSON.stringify(scan.colorMix));
        if (sim >= 0.85) {
            fuzzyMatches += 1.5;
            debugTrace.push(`[COLOR MATCH] Strong similarity: ${sim.toFixed(2)}`);
            sharedAttributes.push({ key: 'color_mix', value: typeof scan.colorMix === 'string' ? scan.colorMix : JSON.stringify(scan.colorMix) });
        } else if (sim >= 0.60) {
            fuzzyMatches += 0.5;
            debugTrace.push(`[COLOR MATCH] Partial similarity: ${sim.toFixed(2)}`);
            sharedAttributes.push({ key: 'color_mix', value: typeof scan.colorMix === 'string' ? scan.colorMix : JSON.stringify(scan.colorMix) });
        } else {
            fuzzyMismatches += 2;
            debugTrace.push(`[COLOR MISMATCH] Similarity too low: ${sim.toFixed(2)}`);
        }
    } else if (dbColorAttr && !scan.colorMix) {
        strictFailures += 0.5;
        debugTrace.push(`[COLOR MISSING] DB has color mix, Scan missed it`);
    }

    // Discriminator Veto (Graphic & Wear)
    const dbGraphic = dbItem.attributes?.find((a: any) => a.key === 'prominent_text_or_graphic')?.value;
    const dbWear = dbItem.attributes?.find((a: any) => a.key === 'distinctive_blemishes_or_wear')?.value;

    if (scan.prominentTextOrGraphic && dbGraphic) {
        const scanGraphTokens = tokenizeAndStem([scan.prominentTextOrGraphic]);
        const dbGraphTokens = tokenizeAndStem([dbGraphic]);
        const sim = calculateWeightedJaccard(scanGraphTokens, dbGraphTokens, idfMap);
        if (sim < 0.35 && new Set([...scanGraphTokens, ...dbGraphTokens]).size > 0) {
            strictFailures += 2;
            debugTrace.push(`[VETO: GRAPHIC] Distinct graphics (Jaccard=${sim.toFixed(2)}): '${scan.prominentTextOrGraphic}' vs '${dbGraphic}'`);
        } else if (sim > 0.75) {
            fuzzyMatches += 2;
            debugTrace.push(`[GRAPHIC MATCH] Strong graphic similarity: ${sim.toFixed(2)}`);
        } else {
            fuzzyMatches += 0.5;
            debugTrace.push(`[GRAPHIC MATCH] Graphic similarity: ${sim.toFixed(2)}`);
        }
    } else if ((scan.prominentTextOrGraphic && !dbGraphic) || (!scan.prominentTextOrGraphic && dbGraphic)) {
        strictFailures += 1;
        debugTrace.push(`[VETO: GRAPHIC] Graphic presence mismatch`);
    }

    if (scan.distinctiveWear && dbWear) {
        const scanWearTokens = tokenizeAndStem([scan.distinctiveWear]);
        const dbWearTokens = tokenizeAndStem([dbWear]);
        const sim = calculateWeightedJaccard(scanWearTokens, dbWearTokens, idfMap);
        if (sim < 0.35 && new Set([...scanWearTokens, ...dbWearTokens]).size > 0) {
            strictFailures += 2;
            debugTrace.push(`[VETO: WEAR] Distinct condition/wear (Jaccard=${sim.toFixed(2)}): '${scan.distinctiveWear}' vs '${dbWear}'`);
        } else if (sim > 0.75) {
            fuzzyMatches += 1;
            debugTrace.push(`[WEAR MATCH] Strong wear pattern match`);
        } else {
            fuzzyMatches += 0.5;
            debugTrace.push(`[WEAR MATCH] Partial wear pattern match`);
        }
    } else if ((scan.distinctiveWear && !dbWear) || (!scan.distinctiveWear && dbWear)) {
        strictFailures += 1;
        debugTrace.push(`[VETO: WEAR] Condition mismatch (One is worn, one is pristine)`);
    }

    // NLP TF-IDF Jaccard
    let dbTokens: string[] = [];
    try { dbTokens = dbItem.semanticTokens ? JSON.parse(dbItem.semanticTokens) : tokenizeAndStem([dbItem.title, dbItem.description]); } catch(e) {}

    const safeScanTokens = Array.isArray(scan.tokens) ? scan.tokens : []; // Failsafe
    const jaccard = calculateWeightedJaccard(dbTokens, safeScanTokens, idfMap);
    
    if (jaccard >= 0.50) {
        fuzzyMatches += 3.0;
        debugTrace.push(`[NLP MATCH] Strong semantic physical overlap (${(jaccard * 100).toFixed(1)}%)`);
    } else if (jaccard >= 0.35) {
        fuzzyMatches += 1.0;
        debugTrace.push(`[NLP PARTIAL] Weak semantic physical overlap (${(jaccard * 100).toFixed(1)}%)`);
    } else if (safeScanTokens.length > 0 && dbTokens.length > 0) {
        fuzzyMismatches += 1.5;
        debugTrace.push(`[NLP CLASH] Physical traits diverge significantly (${(jaccard * 100).toFixed(1)}%)`);
    }

    const normScanTitle = normalizeStr(scan.title || '');
    const normDbTitle = normalizeStr(dbItem.title);
    const genericTerms = ["new item", "default product", "unknown", "unknown item", "tshirt", "t-shirt", "shirt", "jeans", "pants", "shoes", "book", "dvd", "cd", "item", "product", "graphic tshirt", "graphic t-shirt", "hoodie", "sweater", "jacket"];
    const isGenericTitle = genericTerms.includes(normScanTitle) || genericTerms.includes(normDbTitle) || normScanTitle.includes("new item") || normScanTitle.includes("default product") || normScanTitle.includes("unknown");

    let isStrongTextMatch = false;
    if (!isGenericTitle && normDbTitle && normScanTitle) {
        if (normDbTitle === normScanTitle) {
            isStrongTextMatch = true;
            debugTrace.push(`[TEXT MATCH] Exact Title: '${normDbTitle}'`);
        } else {
            const textSim = getSimilarity(normDbTitle, normScanTitle);
            if (textSim > 0.85) {
                isStrongTextMatch = true;
                debugTrace.push(`[TEXT MATCH] Sim=${textSim.toFixed(2)}`);
            } else if (normScanTitle.length > 5 && normDbTitle.includes(normScanTitle)) {
                isStrongTextMatch = true;
                debugTrace.push(`[TEXT MATCH] Scan title inside DB title`);
            } else if (normDbTitle.length > 5 && normScanTitle.includes(normDbTitle)) {
                isStrongTextMatch = true;
                debugTrace.push(`[TEXT MATCH] DB title inside Scan title`);
            }
        }
    }

    let isMatch = false;

    if (fuzzyMismatches >= 2) {
        isMatch = false;
        debugTrace.push(`[RESULT] Failed: Active physical trait clashes (mismatches=${fuzzyMismatches})`);
    } else if (strictFailures >= 1) {
        isMatch = false;
        debugTrace.push(`[RESULT] Failed: Missing required strict traits (strictFailures=${strictFailures})`);
    } else if (isStrongTextMatch && !isGenericTitle && fuzzyMatches >= 1) {
        isMatch = true;
        debugTrace.push(`[RESULT] Pass: Strong Text Match + Validated Traits overrides omissions`);
    } else if (fuzzyMatches >= 3 && fuzzyMismatches === 0) {
        isMatch = true;
        debugTrace.push(`[RESULT] Pass: Strong fuzzy match (${fuzzyMatches} matches)`);
    } else if (fuzzyMatches >= 4) {
        isMatch = true;
        debugTrace.push(`[RESULT] Pass: Overwhelming fuzzy match (${fuzzyMatches} matches)`);
    }

    const score = fuzzyMatches - strictFailures - (fuzzyMismatches * 1.5) + (isStrongTextMatch ? 2 : 0);

    // Cast as any because previous files using it expect exactly { isMatch, confidence }. Adding debugTrace is safe as long as we type-cast locally where used.
    return { isMatch, confidence: isMatch ? 0.95 : 0, score, debugTrace, sharedAttributes } as any;
}

export function buildDuplicateDetails(dbItem: any, match: any) {
    return {
        id: dbItem.id, slug: dbItem.slug, title: dbItem.title, createdAt: dbItem.createdAt,
        categoryName: dbItem.photos?.[0]?.category?.name || 'Uncategorized',
        thumbPath: dbItem.photos?.[0]?.thumbPath || dbItem.photos?.[0]?.orgPath || null,
        orgPath: dbItem.photos?.[0]?.orgPath || null,
        locationName: dbItem.locations?.[0]?.container?.name || 'Unassigned',
        sharedAttributes: match.sharedAttributes,
        debugTrace: match.debugTrace,
        dbAttributes: dbItem.attributes,
        dbLlmAnalysis: dbItem.photos?.[0]?.llmAnalysis ? (() => { try { return JSON.parse(dbItem.photos[0].llmAnalysis); } catch(e) { return null; } })() : null
    };
}

export function findBestMatch(
    scan: ScanContext,
    dbItems: any[], 
    idfMap?: Map<string, number>
) {
    let bestMatch = null;
    let highestScore = -999;
    const actualIdfMap = idfMap || computeIdfMap(dbItems);
    for (const dbItem of dbItems) {
        const match = computeMatch(scan, dbItem, actualIdfMap);
        if (match.isMatch && match.score > highestScore) {
            highestScore = match.score;
            bestMatch = { dbItem, match };
        }
    }
    return bestMatch;
}

export async function flagDuplicatesInList(items: any[], inventoryId: number) {
    if (!items || items.length === 0) return items;
    
    // Dynamic imports to prevent top-level circular dependencies
    const { db } = await import('$lib/server/database');
    const { tokenizeAndStem } = await import('$lib/server/nlp');
    
    const allItems = await db.item.findMany({
        where: { inventoryId },
        include: { attributes: true, locations: { include: { container: true } }, photos: { include: { category: true } } }
    });
    const idfMap = computeIdfMap(allItems);

    for (const item of items) {
        if (item.duplicateDismissed) continue;
        let parsedTokens: string[] = [];
        try { parsedTokens = item.semanticTokens ? JSON.parse(item.semanticTokens) : tokenizeAndStem([item.title, item.description]); } catch(e) {}
        
        const scanCtx: ScanContext = {
            tokens: parsedTokens,
            colorMix: item.attributes?.find((a: any) => a.key === 'color_mix')?.value,
            title: item.title || '',
            description: item.description || '',
            rawText: '',
            category: item.photos?.[0]?.category?.name,
            prominentTextOrGraphic: item.attributes?.find((a: any) => a.key === 'prominent_text_or_graphic')?.value,
            distinctiveWear: item.attributes?.find((a: any) => a.key === 'distinctive_blemishes_or_wear')?.value
        };

        for (const dbItem of allItems) {
            if (dbItem.id === item.id) continue;
            const match = computeMatch(scanCtx, dbItem, idfMap);
            if (match.isMatch) {
                item.hasDuplicate = true;
                break;
            }
        }
    }
    return items;
}