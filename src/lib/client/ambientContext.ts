import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const CACHE_KEY = 'itemlens_ambient_location';
const TTL_MS = 60 * 60 * 1000; // 1 hour

interface AmbientLocation {
    containers: string[];
    timestamp: number;
}

function createAmbientLocationStore() {
    const { subscribe, set } = writable<string[]>([]);

    if (browser) {
        const stored = sessionStorage.getItem(CACHE_KEY);
        if (stored) {
            try {
                const parsed: AmbientLocation = JSON.parse(stored);
                if (Date.now() - parsed.timestamp < TTL_MS) {
                    set(parsed.containers);
                    console.log("🛠️ [DEBUG AMBIENT] Store initialized from sessionStorage:", parsed.containers);
                } else {
                    sessionStorage.removeItem(CACHE_KEY);
                }
            } catch (e) {
                sessionStorage.removeItem(CACHE_KEY);
            }
        }
    }

    return {
        subscribe,
        setContext: (containers: string[]) => {
            if (browser) {
                if (containers && containers.length > 0) {
                    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ containers, timestamp: Date.now() }));
                    console.log("🛠️ [DEBUG AMBIENT] Saved context to sessionStorage:", containers);
                } else {
                    sessionStorage.removeItem(CACHE_KEY);
                    console.log("🛠️ [DEBUG AMBIENT] Cleared context from sessionStorage (empty array passed).");
                }
            }
            set(containers || []);
        },
        clear: () => {
            if (browser) sessionStorage.removeItem(CACHE_KEY);
            set([]);
        }
    };
}

export const ambientLocation = createAmbientLocationStore();