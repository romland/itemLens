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

function colorDistance(c1: string, c2: string): number {
    const rgb1 = Object.entries(BASE_COLORS_RGB).find(([k]) => k.toLowerCase() === c1.toLowerCase())?.[1];
    const rgb2 = Object.entries(BASE_COLORS_RGB).find(([k]) => k.toLowerCase() === c2.toLowerCase())?.[1];
    if (!rgb1 || !rgb2) return 1; // max distance if unknown
    // Calculate Euclidean distance. Max distance in 3D RGB space is sqrt(255^2 * 3) ~= 441.67
    const dist = Math.sqrt(Math.pow(rgb1[0]-rgb2[0], 2) + Math.pow(rgb1[1]-rgb2[1], 2) + Math.pow(rgb1[2]-rgb2[2], 2));
    return dist / 441.67;
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
        if (item.semanticTokens) {
            try {
                const uniqueTokens = new Set<string>(JSON.parse(item.semanticTokens));
                uniqueTokens.forEach(t => dfMap.set(t, (dfMap.get(t) || 0) + 1));
            } catch(e) {}
        }
    });
    dfMap.forEach((df, token) => idfMap.set(token, Math.log((totalDocs + 1) / (df + 1)) + 1));
    return idfMap;
}

export function computeMatch(scanAttributes: Record<string, string>, scanTitle: string, scanDescription: string, scanRawText: string, dbItem: any, activeSchema: any[], idfMap: Map<string, number>, scanCategory?: string): { isMatch: boolean, confidence: number, score: number, debugTrace: string[], sharedAttributes: {key: string, value: string}[] } {
    let strictFailures = 0;
    let fuzzyMatches = 0;
    let fuzzyMismatches = 0;
    const debugTrace: string[] = [];
    const sharedAttributes: { key: string, value: string }[] = [];

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

    const matchedValues = new Set<string>(); // Prevent LLM from double-counting the exact same string across different fields

    // Deduplicate the schema by name. In Draft mode, multiple categories might push the same field name into the array.
    const uniqueSchema: any[] = [];
    const seenFields = new Set<string>();
    for (const f of activeSchema) {
        if (!seenFields.has(f.name)) { seenFields.add(f.name); uniqueSchema.push(f); }
    }

    if (scanAttributes && Object.keys(scanAttributes).length > 0) {
        for (const field of uniqueSchema) {
            const rawScanVal = scanAttributes[field.name];
            const rawDbVal = dbAttributesRaw[field.name];

            const normScanVal = isUseless(rawScanVal) ? null : (typeof rawScanVal === 'object' ? JSON.stringify(rawScanVal) : normalizeStr(String(rawScanVal)));
            const normDbVal = isUseless(rawDbVal) ? null : normalizeStr(rawDbVal);

            if (field.matchWeight === 'STRICT_DEDUPE') {
                if (rawDbVal && rawScanVal) {
                    // Split RAW values ONLY by commas, preserving full phrases (e.g. "adidas logo" -> "adidaslogo")
                    // This prevents two different brands from matching just because they both contain the word "logo"
                    const dbVals = rawDbVal.split(',').map(normalizeStr).filter(Boolean);
                    const scanVals = String(rawScanVal).split(',').map(normalizeStr).filter(Boolean);
                    const hasIntersection = dbVals.some(v => scanVals.includes(v));
                    
                    if (!hasIntersection && dbVals.length > 0 && scanVals.length > 0) {
                        // Word Root Overlap check: Allow the LLM to phrase the same graphic slightly differently
                        const dbWords = String(rawDbVal).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
                        const scanWords = String(rawScanVal).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
                        
                        const sharedWords = dbWords.filter(dw => scanWords.some(sw => dw.includes(sw.replace(/s$|ed$|ing$/, '')) || sw.includes(dw.replace(/s$|ed$|ing$/, ''))));

                        if (sharedWords.length > 0) {
                            fuzzyMatches += 1.0;
                            debugTrace.push(`[STRICT RECOVERED] ${field.name}: Shared keywords '${sharedWords.join(',')}' between DB='${rawDbVal}' & Scan='${rawScanVal}'`);
                            sharedAttributes.push({ key: field.name, value: typeof rawScanVal === 'object' ? JSON.stringify(rawScanVal) : String(rawScanVal) });
                        } else {
                            strictFailures += 1.5;
                            debugTrace.push(`[STRICT CLASH] ${field.name}: DB='${rawDbVal}' contradicts Scan='${rawScanVal}' (No shared keywords)`);
                        }
                    } else if (hasIntersection) {
                        const matchedString = dbVals.find(v => scanVals.includes(v))!;
                        if (!matchedValues.has(matchedString)) {
                            fuzzyMatches += 1.5;
                            matchedValues.add(matchedString);
                            debugTrace.push(`[STRICT MATCH] ${field.name} overlaps: DB='${rawDbVal}' & Scan='${rawScanVal}'`);
                            sharedAttributes.push({ key: field.name, value: typeof rawScanVal === 'object' ? JSON.stringify(rawScanVal) : String(rawScanVal) });
                        } else {
                            debugTrace.push(`[STRICT MATCH IGNORED] ${field.name} '${matchedString}' already gave points elsewhere`);
                        }
                    }
                } else if (normDbVal && !normScanVal) {
                    // DB has it, Scan missed it in attributes.
                    // Check if the scan's raw text or description contains the DB's strict value as a fallback
                    const dbWords = String(rawDbVal).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
                    const scanFullText = `${scanRawText || ''} ${scanTitle || ''} ${scanDescription || ''}`.toLowerCase();
                    const hasHiddenOverlap = dbWords.length > 0 && dbWords.some(w => scanFullText.includes(w));
                    
                    if (hasHiddenOverlap) {
                        fuzzyMatches += 1.0;
                        debugTrace.push(`[STRICT RECOVERED] ${field.name}: DB='${rawDbVal}' found in Scan Description/RawText`);
                    } else {
                        strictFailures += 1.0; 
                        debugTrace.push(`[STRICT MISSING] ${field.name}: DB='${rawDbVal}', Scan missed it completely`);
                    }
                }
            } else if (field.matchWeight === 'SUBJECTIVE_TEXT') {
                if (rawDbVal && rawScanVal) {
                    let dbTokens: string[] = [];
                    try { dbTokens = dbItem.semanticTokens ? JSON.parse(dbItem.semanticTokens) : tokenizeAndStem([rawDbVal]); } catch(e) { dbTokens = tokenizeAndStem([rawDbVal]); }
                    const scanTokens = tokenizeAndStem([String(rawScanVal)]);
                    
                    let intersectionWeight = 0;
                    let unionWeight = 0;
                    const uniqueUnion = new Set([...dbTokens, ...scanTokens]);
                    
                    for (const token of uniqueUnion) {
                        const weight = idfMap.get(token) || 1.0;
                        unionWeight += weight;
                        if (dbTokens.includes(token) && scanTokens.includes(token)) intersectionWeight += weight;
                    }
                    
                    const jaccard = unionWeight > 0 ? intersectionWeight / unionWeight : 0;
                    if (jaccard > 0.4) {
                        fuzzyMatches += 2.0;
                        debugTrace.push(`[SUBJECTIVE MATCH] ${field.name} strong semantic overlap (${(jaccard * 100).toFixed(1)}%)`);
                        sharedAttributes.push({ key: field.name, value: typeof rawScanVal === 'object' ? JSON.stringify(rawScanVal) : String(rawScanVal) });
                    } else if (jaccard > 0.15) {
                        fuzzyMatches += 0.5;
                        debugTrace.push(`[SUBJECTIVE PARTIAL] ${field.name} weak semantic overlap (${(jaccard * 100).toFixed(1)}%)`);
                    } else {
                        debugTrace.push(`[SUBJECTIVE CLASH] ${field.name} low semantic overlap (${(jaccard * 100).toFixed(1)}%) - Ignoring penalty.`);
                    }
                } else if (normDbVal && !normScanVal) {
                    debugTrace.push(`[SUBJECTIVE MISSING] ${field.name}: DB='${rawDbVal}', Scan missed it completely. Ignored.`);
                }                
            } else if (field.matchWeight === 'FUZZY_SECONDARY') {
                if (normDbVal && normScanVal && normDbVal === normScanVal) {
                    if (!matchedValues.has(normDbVal)) {
                        fuzzyMatches += 1.0;
                        matchedValues.add(normDbVal);
                        debugTrace.push(`[FUZZY MATCH] ${field.name} == '${normDbVal}'`);
                        sharedAttributes.push({ key: field.name, value: typeof rawScanVal === 'object' ? JSON.stringify(rawScanVal) : String(rawScanVal) });
                    } else {
                        debugTrace.push(`[FUZZY MATCH IGNORED] ${field.name} '${normDbVal}' already gave points elsewhere`);
                    }
                } else if (normDbVal && normScanVal && normDbVal !== normScanVal) {
                    fuzzyMismatches++;
                    debugTrace.push(`[FUZZY MISMATCH] ${field.name}: DB='${normDbVal}' != Scan='${normScanVal}'`);
                }
            } else if (field.matchWeight === 'COLOR_PROPORTION') {
                if (rawDbVal && rawScanVal) {
                    const sim = calculateColorMixSimilarity(rawDbVal, rawScanVal);
                    if (sim >= 0.85) {
                        fuzzyMatches += 1.5;
                        debugTrace.push(`[COLOR MATCH] ${field.name} strong similarity: ${sim.toFixed(2)}`);
                        sharedAttributes.push({ key: field.name, value: typeof rawScanVal === 'object' ? JSON.stringify(rawScanVal) : String(rawScanVal) });
                    } else if (sim >= 0.70) {
                        fuzzyMatches += 0.5;
                        debugTrace.push(`[COLOR MATCH] ${field.name} partial similarity: ${sim.toFixed(2)}`);
                        sharedAttributes.push({ key: field.name, value: typeof rawScanVal === 'object' ? JSON.stringify(rawScanVal) : String(rawScanVal) });
                    } else {
                        fuzzyMismatches += 2;
                        debugTrace.push(`[COLOR MISMATCH] ${field.name} similarity too low: ${sim.toFixed(2)}`);
                    }
                } else if (rawDbVal && !rawScanVal) {
                    strictFailures += 0.5;
                    debugTrace.push(`[COLOR MISSING] DB has color mix, Scan missed it`);
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

    const normScanTitle = normalizeStr(scanTitle || '');
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
        debugTrace.push(`[RESULT] Failed: Active attribute clashes (mismatches=${fuzzyMismatches})`);
    } else if (strictFailures >= 1) {
        isMatch = false;
        debugTrace.push(`[RESULT] Failed: Missing required strict attributes (strictFailures=${strictFailures})`);
    } else if (isStrongTextMatch && !isGenericTitle && fuzzyMatches >= 1) {
        isMatch = true;
        debugTrace.push(`[RESULT] Pass: Strong Text Match + Validated Attributes overrides omissions`);
    } else if (scanAttrCount >= 2 && dbAttrCount === 0) {
        isMatch = false;
        debugTrace.push(`[RESULT] Failed: Attribute imbalance (Scan has ${scanAttrCount}, DB has 0)`);
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

export function findBestMatch(scanAttributes: Record<string, string>, scanTitle: string, scanDescription: string, scanRawText: string, dbItems: any[], activeSchema: any[], scanCategory?: string) {
    let bestMatch = null;
    let highestScore = -999;
    const idfMap = computeIdfMap(dbItems);
    for (const dbItem of dbItems) {
        const match = computeMatch(scanAttributes, scanTitle, scanDescription, scanRawText, dbItem, activeSchema, idfMap, scanCategory);
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
    const { getActiveSchema } = await import('$lib/server/ontology');
    
    const activeSchema = await getActiveSchema(inventoryId, null, true);
    const allItems = await db.item.findMany({
        where: { inventoryId },
        include: { attributes: true, locations: { include: { container: true } }, photos: { include: { category: true } } }
    });
    const idfMap = computeIdfMap(allItems);

    for (const item of items) {
        if (item.duplicateDismissed) continue;
        const itemAttrs: Record<string, string> = {};
        item.attributes?.forEach((a: any) => itemAttrs[a.key] = a.value);
        for (const dbItem of allItems) {
            if (dbItem.id === item.id) continue;
            const match = computeMatch(itemAttrs, item.title || '', item.description || '', '', dbItem, activeSchema, idfMap, item.photos?.[0]?.category?.name);
            if (match.isMatch) {
                item.hasDuplicate = true;
                break;
            }
        }
    }
    return items;
}
