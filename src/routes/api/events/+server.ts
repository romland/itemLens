import { dbEvents } from '$lib/server/database';

export function GET() {
    let listener: () => void;

    const stream = new ReadableStream({
        start(controller) {
            // Streams in SvelteKit must be byte arrays, not plain strings
            const encoder = new TextEncoder();
            
            // Send an immediate empty comment to establish the connection for Firefox
            controller.enqueue(encoder.encode(': connected\n\n'));

            listener = () => {
                try {
                    // Push the signal as an encoded byte array
                    controller.enqueue(encoder.encode('data: update\n\n'));
                } catch (e) {
                    // Client disconnected silently
                }
            };
            
            // Listen for the Prisma extension triggers
            dbEvents.on('mutation', listener);
        },
        cancel() {
            // Clean up memory the instant the client disconnects
            dbEvents.off('mutation', listener);
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Connection': 'keep-alive'
        }
    });
}