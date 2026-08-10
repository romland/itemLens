import { PrismaClient } from "@prisma/client";
import { EventEmitter } from "events";

// 1. Create or retrieve the global event emitter to survive HMR in dev
const dbEvents = (globalThis as any).dbEvents || new EventEmitter();
dbEvents.setMaxListeners(50);

// 2. Wrap the extended client in a factory function
function createExtendedClient() {
    return new PrismaClient().$extends({
        query: {
            $allModels: {
                async $allOperations({ operation, args, query }) {
                    const result = await query(args);
                    
                    // If the operation modifies data, broadcast it locally
                    const mutatingOps = ['create', 'update', 'delete', 'createMany', 'updateMany', 'deleteMany', 'upsert'];
                    if (mutatingOps.includes(operation)) {
                        dbEvents.emit('mutation');
                    }
                    
                    return result;
                }
            }
        }
    }) as unknown as PrismaClient; // Cast required to keep your existing app types happy
}

// 3. Use the singleton pattern for the extended database client
const db = global.db || createExtendedClient();

if (process.env.NODE_ENV === 'development') {
    global.db = db;
    (globalThis as any).dbEvents = dbEvents;
}

export { db, dbEvents };