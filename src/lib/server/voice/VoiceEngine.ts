import { db } from '$lib/server/database';
import { tokenizeAndStem } from '$lib/server/nlp';

const NUM_WORDS: Record<string, string> = {
    zero: '0', nul: '0',
    one: '1', een: '1',
    two: '2', twee: '2',
    three: '3', drie: '3',
    four: '4', vier: '4',
    five: '5', vijf: '5',
    six: '6', zes: '6',
    seven: '7', zeven: '7',
    eight: '8', acht: '8',
    nine: '9', negen: '9',
    ten: '10', tien: '10',
    eleven: '11', elf: '11',
    twelve: '12', twaalf: '12',
    thirteen: '13', dertien: '13',
    fourteen: '14', veertien: '14',
    fifteen: '15', vijftien: '15',
    sixteen: '16', zestien: '16',
    seventeen: '17', zeventien: '17',
    eighteen: '18', achttien: '18',
    nineteen: '19', negentien: '19',
    twenty: '20', twintig: '20',
    thirty: '30', dertig: '30',
    forty: '40', veertig: '40',
    fifty: '50', vijftig: '50',
    sixty: '60', zestig: '60',
    seventy: '70', zeventig: '70',
    eighty: '80', tachtig: '80',
    ninety: '90', negentig: '90',
    hundred: '100', honderd: '100'
};

function normalizeNumeralsAndCompounds(text: string): string[] {
    const cleaned = text.toLowerCase().replace(/[-_]+/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const digitReplaced = tokens.map(t => NUM_WORDS[t] || t);

    // Fold compound tens + units (e.g., ["60", "4"] -> "64")
    const folded: string[] = [];
    for (let i = 0; i < digitReplaced.length; i++) {
        const curr = digitReplaced[i];
        const next = digitReplaced[i + 1];
        if (curr && next && /^[2-9]0$/.test(curr) && /^[1-9]$/.test(next)) {
            folded.push(String(parseInt(curr, 10) + parseInt(next, 10)));
            i++;
        } else {
            folded.push(curr);
        }
    }

    const variants = new Set<string>();
    variants.add(folded.join(' '));
    variants.add(folded.join('')); // "pine" + "64" -> "pine64"
    return Array.from(variants);
}

function normalizeQuery(text: string): string {
    const cleaned = text.toLowerCase().replace(/[-_]+/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const digitReplaced = tokens.map(t => NUM_WORDS[t] || t);

    const folded: string[] = [];
    for (let i = 0; i < digitReplaced.length; i++) {
        const curr = digitReplaced[i];
        const next = digitReplaced[i + 1];
        if (curr && next && /^[2-9]0$/.test(curr) && /^[1-9]$/.test(next)) {
            folded.push(String(parseInt(curr, 10) + parseInt(next, 10)));
            i++;
        } else {
            folded.push(curr);
        }
    }

    return folded.join(' ');
}

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
    
    const textVariants = normalizeNumeralsAndCompounds(subject);
    const subjectTokens = Array.from(new Set(textVariants.flatMap(v => tokenizeAndStem([v]))));
    if (subjectTokens.length === 0) return [];
    
    const scoredItems = allItems.map(item => {
        const itemTitle = item.title || '';
        const titleVariants = normalizeNumeralsAndCompounds(itemTitle);
        const titleTokens = Array.from(new Set(titleVariants.flatMap(v => tokenizeAndStem([v]))));
        const tagTokens = item.tags ? item.tags.flatMap((t: any) => tokenizeAndStem([t.name])) : [];
        const matches = subjectTokens.filter(t => titleTokens.includes(t) || tagTokens.includes(t)).length;
        const cleanSubj = subject.toLowerCase();
        const cleanTitle = itemTitle.toLowerCase();
        const exactTitleBonus = (cleanTitle.includes(cleanSubj) || textVariants.some(v => cleanTitle.replace(/\s+/g, '').includes(v.replace(/\s+/g, '')))) ? 5 : 0;
        const score = matches + exactTitleBonus;
        return { item, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    return scoredItems.map(x => x.item);
};

const getDirectRoute = (items: any[]) => items.length === 1 ? `/${items[0].id}/${items[0].slug}` : undefined;

const getContainerSummary = (items: any[]): string => {
    const containerNames = new Set<string>();
    for (const item of items) {
        item.locations?.forEach((l: any) => containerNames.add(l.container.name));
    }
    const list = Array.from(containerNames);
    if (list.length === 0) return 'unassigned locations';

    const groups = new Map<string, number[]>();
    const others: string[] = [];

    for (const name of list) {
        const match = name.trim().match(/^([A-Za-z]+)\s*0*(\d+)$/);
        if (match) {
            const prefix = match[1].toUpperCase();
            const num = parseInt(match[2], 10);
            if (!groups.has(prefix)) groups.set(prefix, []);
            groups.get(prefix)!.push(num);
        } else {
            others.push(name);
        }
    }

    const formattedGroups: string[] = [];
    for (const [prefix, nums] of groups.entries()) {
        nums.sort((a, b) => a - b);
        if (nums.length === 1) {
            formattedGroups.push(`${prefix} ${nums[0].toString().padStart(3, '0')}`);
        } else {
            const first = `${prefix} ${nums[0].toString().padStart(3, '0')}`;
            const remainingNums = nums.slice(1);
            const visible = remainingNums.slice(0, 3).map(n => n.toString());
            const overflowCount = remainingNums.length - visible.length;

            if (overflowCount > 0) {
                formattedGroups.push(`${first}, ${visible.join(', ')} and ${overflowCount} others`);
            } else if (visible.length === 1) {
                formattedGroups.push(`${first} and ${visible[0]}`);
            } else {
                formattedGroups.push(`${first}, ${visible.slice(0, -1).join(', ')} and ${visible[visible.length - 1]}`);
            }
        }
    }

    const allResults = [...formattedGroups, ...others];
    if (allResults.length === 0) return 'unassigned locations';
    if (allResults.length === 1) return allResults[0];
    if (allResults.length === 2) return `${allResults[0]} and ${allResults[1]}`;
    const visibleGroups = allResults.slice(0, 2);
    const remainingGroupCount = allResults.length - visibleGroups.length;
    return `${visibleGroups.join(', ')} and ${remainingGroupCount} other ${remainingGroupCount === 1 ? 'location' : 'locations'}`;
};

// --- PLUG & PLAY INTENT REGISTRY ---
const intents: VoiceIntent[] = [
    {
        name: 'Locate', // e.g., "Where do I have an antenna", "Find the ESP32"
        match: (text) => text.match(/^(?:where is|where's|where are|where do i have|where do we have|find|locate|waar is|waar zijn|zoek)(?:\s+(?:the|my|a|an|de|het|een))?\s+(.+)$/i),
        process: async (match, inventoryId) => {
            const subject = normalizeQuery(match[1].trim());
            const items = await findItems(subject, inventoryId);
            if (items.length === 0) return { query: subject, spokenReply: `I couldn't find any ${subject} in your collection.` };
            
            if (items.length === 1) {
                const bestItem = items[0];
                const route = getDirectRoute(items);
                if (bestItem.locations && bestItem.locations.length > 0) {
                    const locs = bestItem.locations.map((l: any) => l.container.name).join(' and ');
                    return { query: subject, spokenReply: `I found it in ${locs}.`, route };
                }
                return { query: subject, spokenReply: `I found it, but it doesn't have a location assigned yet.`, route };
            }
            const containerSummary = getContainerSummary(items);
            const idList = items.map((i: any) => i.id).join(',');
            return { query: subject, spokenReply: `I found ${items.length} items in ${containerSummary}.`, route: `/search?q=${encodeURIComponent(subject)}&ids=${idList}` };
        }
    },
    {
        name: 'Stock', // e.g., "Do I have any e-ink displays?", "How many eink displays i have"
        match: (text) => text.match(/^(?:how many|do i have|do we have|i need)(?:\s+(?:any|a|an|some|een))?\s+(.+?)(?:\s+(?:do i have|do we have|i have|we have|in stock|left))?$/i),
        process: async (match, inventoryId) => {
            const subject = normalizeQuery(match[1].trim());
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
            const subject = normalizeQuery(match[1].trim());
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
            const subject = normalizeQuery(match[1].trim());
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