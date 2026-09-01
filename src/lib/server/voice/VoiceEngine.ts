import { db } from '$lib/server/database';
import { tokenizeAndStem } from '$lib/server/nlp';

export interface VoiceIntent {
    name: string;
    match: (text: string) => RegExpMatchArray | null;
    process: (match: RegExpMatchArray, inventoryId: number) => Promise<{ query: string, spokenReply: string | null, route?: string }>;
}

export const findItems = async (subject: string, inventoryId: number) => {
    const allItems = await db.item.findMany({
        where: { inventoryId },
        select: { id: true, title: true, slug: true, amount: true, tags: { select: { name: true } }, locations: { include: { container: { select: { name: true } } } } }
    });
    
    const subjectTokens = tokenizeAndStem([subject]);
    if (subjectTokens.length === 0) return [];
    
    const scoredItems = allItems.map(item => {
        const titleTokens = tokenizeAndStem([item.title || '']);
        const tagTokens = item.tags ? item.tags.flatMap((t: any) => tokenizeAndStem([t.name])) : [];
        const score = subjectTokens.filter(t => titleTokens.includes(t) || tagTokens.includes(t)).length;
        return { item, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    return scoredItems.map(x => x.item);
};

const getDirectRoute = (items: any[]) => items.length === 1 ? `/${items[0].id}/${items[0].slug}` : undefined;

// --- PLUG & PLAY INTENT REGISTRY ---
const intents: VoiceIntent[] = [
    {
        name: 'Locate', // e.g., "Where do I have an antenna", "Find the ESP32"
        match: (text) => text.match(/^(?:where is|where's|where are|where do i have|where do we have|find|locate|waar is|waar zijn|zoek)(?:\s+(?:the|my|a|an|de|het|een))?\s+(.+)$/i),
        process: async (match, inventoryId) => {
            const subject = match[1].trim();
            const items = await findItems(subject, inventoryId);
            if (items.length === 0) return { query: subject, spokenReply: `I couldn't find any ${subject} in your collection.` };
            
            const bestItem = items[0];
            const route = getDirectRoute(items);
            if (bestItem.locations && bestItem.locations.length > 0) {
                const locs = bestItem.locations.map((l: any) => l.container.name).join(' and ');
                return { query: bestItem.title || subject, spokenReply: `I found it in ${locs}.`, route };
            }
            return { query: bestItem.title || subject, spokenReply: `I found it, but it doesn't have a location assigned yet.`, route };
        }
    },
    {
        name: 'Stock', // e.g., "Do I have any e-ink displays?", "How many eink displays i have"
        match: (text) => text.match(/^(?:how many|do i have|do we have|i need)(?:\s+(?:any|a|an|some|een))?\s+(.+?)(?:\s+(?:do i have|do we have|i have|we have|in stock|left))?$/i),
        process: async (match, inventoryId) => {
            const subject = match[1].trim();
            const items = await findItems(subject, inventoryId);
            if (items.length === 0) return { query: subject, spokenReply: `No, I don't see any ${subject} in your collection.` };
            
            const totalStock = items.reduce((sum, item) => sum + (item.amount === null ? 1 : item.amount), 0);
            return { query: subject, spokenReply: `You have ${totalStock} of them.`, route: getDirectRoute(items) };
        }
    },
    {
        name: 'List', // e.g., "Which servos do I have?"
        match: (text) => text.match(/^(?:list|list all|which|what)(?:\s+(?:all|types of|kind of))?\s+(.+?)(?:\s+(?:do i have|do we have|are there|is there))?$/i),
        process: async (match, inventoryId) => {
            const subject = match[1].trim();
            const items = await findItems(subject, inventoryId);
            if (items.length === 0) return { query: subject, spokenReply: `You don't have any ${subject}.` };
            
            const titles = items.map(i => i.title).filter(Boolean);
            if (titles.length <= 3) return { query: subject, spokenReply: `You have ${titles.length}: ${titles.join(', ')}.` };
            return { query: subject, spokenReply: `You have ${titles.length} of them, including ${titles[0]}, ${titles[1]}, and ${titles.length - 2} others.` };
        }
    },
    {
        name: 'Fallback', // Standard keyword search
        match: (text) => text.match(/(.*)/),
        process: async (match, inventoryId) => {
            const subject = match[1].trim();
            const items = await findItems(subject, inventoryId);
            if (items.length === 0) return { query: subject, spokenReply: `I couldn't find anything for ${subject}.` };
            return { query: subject, spokenReply: null, route: getDirectRoute(items) }; 
        }
    }
];

export const processVoiceQuery = async (transcription: string, inventoryId: number) => {
    const cleanText = transcription.toLowerCase().replace(/[.?!]+$/, '').trim();
    for (const intent of intents) {
        const match = intent.match(cleanText);
        if (match) return await intent.process(match, inventoryId);
    }
    return { query: cleanText, spokenReply: null };
};