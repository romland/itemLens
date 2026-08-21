import natural from 'natural';

const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'with', 'to', 'of', 'for', 'is', 'it', 'this', 'that']);

export function tokenizeAndStem(texts: (string | null | undefined)[]): string[] {
    const allTokens: string[] = [];
    for (const text of texts) {
        if (!text) continue;
        const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
        for (const t of tokens) {
            if (t.length > 2 && !stopWords.has(t)) {
                allTokens.push(stemmer.stem(t));
            }
        }
    }
    return allTokens;
}

export function calculateWeightedJaccard(tokensA: string[], tokensB: string[], idfMap?: Map<string, number>): number {
    if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
    
    let intersectionWeight = 0;
    let unionWeight = 0;
    const uniqueUnion = new Set([...tokensA, ...tokensB]);
    
    for (const token of uniqueUnion) {
        const weight = idfMap?.get(token) || 1.0;
        unionWeight += weight;
        if (tokensA.includes(token) && tokensB.includes(token)) intersectionWeight += weight;
    }
    
    return unionWeight > 0 ? intersectionWeight / unionWeight : 0;
}
