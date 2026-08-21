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