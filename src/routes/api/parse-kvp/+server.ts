// src/routes/api/parse-kvp/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractKVPsFromText } from '$lib/server/gemini-classification';

export const POST: RequestHandler = async ({ request, locals }) => {
    // Basic auth check
    if (!locals.user) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { text } = await request.json();
        
        if (!text || text.length < 10) {
            return json({ success: false, error: 'Text too short' });
        }

        const result = await extractKVPsFromText(text);
        
        if (result && result.kvps) {
            return json({ success: true, kvps: result.kvps });
        }
        
        return json({ success: false, error: 'LLM failed to parse' });
    } catch (e) {
        console.error("KVP API parsing error:", e);
        return json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
};