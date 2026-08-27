import { EventEmitter } from 'events';

class SystemHealth extends EventEmitter {
    private degradedReason: string | null = null;
    private timeout: NodeJS.Timeout | null = null;

    setDegraded(reason: string, ttlMs: number = 60000) {
        this.degradedReason = reason;
        this.emit('update', { status: 'degraded', reason });
        
        if (this.timeout) clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.clearDegraded(), ttlMs);
    }

    clearDegraded() {
        if (this.degradedReason) {
            this.degradedReason = null;
            if (this.timeout) clearTimeout(this.timeout);
            this.emit('update', { status: 'healthy', reason: null });
        }
    }

    getStatus() {
        return {
            status: this.degradedReason ? 'degraded' : 'healthy',
            reason: this.degradedReason
        };
    }
}

export const systemHealth = new SystemHealth();