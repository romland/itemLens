// src/routes/api/voice-search/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';
import Groq from 'groq-sdk';
import { env } from '$env/dynamic/private';
import { recordLLMLog } from '$lib/server/llmLogger';
import { logActivity } from '$lib/server/logger';
import { tokenizeAndStem } from '$lib/server/nlp';

// --- VOICE INTENT MIDDLEWARE ---
// Easily extensible for multilingual support, new commands, or different collections
async function evaluateVoiceIntents(transcription: string, inventoryId: number): Promise<{ query: string, spokenReply: string | null }> {
    const text = transcription.toLowerCase();
    
    // Intent 1: Find Location (English & Dutch examples)
    const locationRegex = /^(?:where is|where's|where are|find|locate|waar is|waar zijn|zoek)(?:\s+(?:the|my|a|an|de|het|een))?\s+(.+)/i;
    const locMatch = text.match(locationRegex);
    
    if (locMatch) {
        const subject = locMatch[1].replace(/[^a-zA-Z0-9\s-]/g, '').trim();
        
        const allItems = await db.item.findMany({
            where: { inventoryId },
            include: { locations: { include: { container: true } } }
        });

        const subjectTokens = tokenizeAndStem([subject]);
        let bestItem = null;
        let maxScore = 0;

        for (const item of allItems) {
            if (!item.title) continue;
            const titleTokens = tokenizeAndStem([item.title]);
            const matchCount = subjectTokens.filter(t => titleTokens.includes(t)).length;
            if (matchCount > maxScore) {
                maxScore = matchCount;
                bestItem = item;
            }
        }

        if (bestItem && maxScore > 0) {
            if (bestItem.locations && bestItem.locations.length > 0) {
                const locs = bestItem.locations.map((l: any) => l.container.name).join(' and ');
                return { query: bestItem.title, spokenReply: `It is in ${locs}.` };
            } else {
                return { query: bestItem.title, spokenReply: `I found it, but it doesn't have a location assigned yet.` };
            }
        }
        
        return { query: subject, spokenReply: null };
    }

    // Add more intents here in the future (e.g. "Add 5 to stock for X", "Delete X")

    // Default: Fallback to standard visual search
    return { query: transcription, spokenReply: null };
}

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const t0 = performance.now();
    let fileSize = 0;

    try {
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;
        
        if (audioFile) fileSize = audioFile.size;

        if (!audioFile || audioFile.size === 0) {
            await logActivity(null, 'Voice Search', 'Received empty audio payload from browser.', 'error');
            recordLLMLog('Voice Search (Failed)', 'groq', { error: 'Empty audio file' }, { error: 'No audio data' }, performance.now() - t0, 0, 0);
            return json({ error: 'No audio provided' }, { status: 400 });
        }

        // Fetch Categories and Tags to build a hyper-specific dictionary cheat sheet
        const [categories, tags] = await Promise.all([
            db.category.findMany({
                where: { inventoryId: locals.activeInventoryId },
                select: { name: true }
            }),
            db.tag.findMany({
                where: { inventoryId: locals.activeInventoryId },
                select: { name: true },
                take: 50 // Limit to avoid overflowing Whisper's 224-token prompt window
            })
        ]);

        const categoryNames = categories.map(c => c.name).join(', ');
        const tagNames = tags.map(t => t.name).join(', ');
        
        // We prime the model with the user's exact data to guide unfamiliar spellings
        const contextPrompt = `Inventory search context. Expected vocabulary includes: ${categoryNames}. Tags: ${tagNames}.`;

        // Transcribe via Groq's lightning-fast Whisper model
        const groq = new Groq({ apiKey: env.GROQ_API_TOKEN });
        const transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-large-v3-turbo',
            prompt: contextPrompt,
            response_format: 'verbose_json'
        });

        const rawTranscription = transcription.text.replace(/[.?!]+$/, '').trim();
        const durationMs = performance.now() - t0;

        // Pass the raw text through the intent middleware
        const { query: finalQuery, spokenReply } = await evaluateVoiceIntents(rawTranscription, locals.activeInventoryId);

        // Extract token usage from Groq's verbose_json response, otherwise estimate so graphs don't flatline
        const groqData = transcription as any;
        const tokensIn = groqData.x_groq?.usage?.prompt_tokens || Math.round(fileSize / 100); 
        const tokensOut = groqData.x_groq?.usage?.completion_tokens || rawTranscription.split(' ').length;

        recordLLMLog('Voice Search', 'groq', { prompt: contextPrompt, fileSize }, { text: rawTranscription, finalQuery, spokenReply, usage: groqData.x_groq?.usage }, durationMs, tokensIn, tokensOut);
        await logActivity(null, 'Voice Search', `Transcribed audio to query: "${finalQuery}"`, 'info');

        return json({ success: true, text: finalQuery, spokenReply });
    } catch (error: any) {
        console.error('Groq Whisper error:', error);
        const durationMs = performance.now() - t0;
        recordLLMLog('Voice Search (Failed)', 'groq', { fileSize }, { error: error.message }, durationMs, 0, 0);
        await logActivity(null, 'Voice Search', `Audio transcription failed.`, 'error', error.message);
        return json({ error: 'Transcription failed' }, { status: 500 });
    }
};