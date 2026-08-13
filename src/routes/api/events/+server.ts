import { dbEvents } from '$lib/server/database';
import { taskEvents } from '$lib/server/taskManager';

export function GET() {
    let listener: () => void;
    let debounceTimeout: NodeJS.Timeout;

    const stream = new ReadableStream({
        start(controller) {
            // Streams in SvelteKit must be byte arrays, not plain strings
            const encoder = new TextEncoder();
            
            // Send an immediate empty comment to establish the connection for Firefox
            controller.enqueue(encoder.encode(': connected\n\n'));

            listener = () => {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    try {
                        // Push the signal as an encoded byte array
                        controller.enqueue(encoder.encode('data: update\n\n'));
                    } catch (e) {
                        // Client disconnected silently
                    }
                }, 500); // Wait 500ms for DB mutations to settle before notifying client
            };
            
            // Listen for the Prisma extension triggers and active Task updates
            dbEvents.on('mutation', listener);
            taskEvents.on('update', listener);
        },
        cancel() {
            clearTimeout(debounceTimeout);
            // Clean up memory the instant the client disconnects
            dbEvents.off('mutation', listener);
            taskEvents.off('update', listener);
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            // 'Connection': 'keep-alive'
        }
    });
}