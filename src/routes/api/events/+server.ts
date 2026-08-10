import { dbEvents } from '$lib/server/database';

export function GET() {
    let listener: () => void;

    const stream = new ReadableStream({
        start(controller) {
            listener = () => {
                try {
                    // Push a tiny signal to the client
                    controller.enqueue(`data: update\n\n`);
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