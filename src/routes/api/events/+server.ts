import { dbEvents } from '$lib/server/database';
import { taskEvents } from '$lib/server/taskManager';

export function GET() {
    let listener: () => void;
    let debounceTimeout: NodeJS.Timeout;
    let lastFireTime = 0;

    const stream = new ReadableStream({
        start(controller) {
            // Streams in SvelteKit must be byte arrays, not plain strings
            const encoder = new TextEncoder();
            
            // Send an immediate empty comment to establish the connection for Firefox
            controller.enqueue(encoder.encode(': connected\n\n'));

            listener = () => {
                const now = Date.now();
                const fire = () => {
                    lastFireTime = Date.now();
                    try {
                        controller.enqueue(encoder.encode('data: update\n\n'));
                    } catch (e) {
                        // Client disconnected silently
                    }
                };

                clearTimeout(debounceTimeout);
                // Prevent starvation: If mutations are pouring in constantly, 
                // force an update at least every 1.5 seconds so the UI trickles in data.
                if (now - lastFireTime >= 1500) {
                    fire();
                } else {
                    // Otherwise, group rapid successive mutations after a 500ms quiet period
                    debounceTimeout = setTimeout(fire, 500);
                }
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