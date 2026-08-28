<script lang="ts">
    import { enhance } from "$app/forms";
    import RelativeDate from "./RelativeDate.svelte";
    import { notify } from "$lib/client/notifications";

    export let sessions: any[] = [];
    export let currentSessionHash: string = '';

    function getDeviceInfo(ua: string | null) {
        if (!ua) return { icon: 'bi-laptop', name: 'Unknown Device' };
        const lower = ua.toLowerCase();
        if (lower.includes('iphone') || lower.includes('ipad')) return { icon: 'bi-phone', name: 'Apple Device' };
        if (lower.includes('android')) return { icon: 'bi-phone-fill', name: 'Android Device' };
        if (lower.includes('mac os')) return { icon: 'bi-apple', name: 'Mac' };
        if (lower.includes('windows')) return { icon: 'bi-windows', name: 'Windows PC' };
        if (lower.includes('linux')) return { icon: 'bi-pc-display', name: 'Linux PC' };
        return { icon: 'bi-laptop', name: 'Browser' };
    }
</script>

<div class="flex flex-col gap-3">
    {#each sessions as session}
        {@const device = getDeviceInfo(session.userAgent)}
        {@const isCurrent = session.sessionHash === currentSessionHash}
        
        <div class="flex items-center justify-between p-4 bg-base-200/50 rounded-xl border border-base-200">
            <div class="flex items-center gap-4 min-w-0">
                <div class="w-10 h-10 rounded-full bg-base-300 flex items-center justify-center shrink-0">
                    <i class="bi {device.icon} text-xl text-gray-500"></i>
                </div>
                <div class="flex flex-col min-w-0">
                    <div class="font-bold text-sm text-base-content flex items-center gap-2">
                        {device.name}
                        {#if isCurrent}
                            <span class="badge badge-success badge-sm text-white text-[10px] font-bold uppercase tracking-wider border-none">This Device</span>
                        {/if}
                    </div>
                    <div class="text-xs text-gray-500 truncate mt-0.5">
                        <span class="mr-2">Last active <RelativeDate date={session.lastActiveAt} /></span>
                        {#if session.ipAddress}
                            <span class="opacity-50 font-mono hidden sm:inline">• {session.ipAddress}</span>
                        {/if}
                    </div>
                </div>
            </div>
            
            {#if !isCurrent}
                <form method="POST" action="?/revokeSession" use:enhance={() => { return async ({ update }) => { await update(); notify('success', 'Device signed out.'); }; }}>
                    <input type="hidden" name="sessionId" value={session.id}>
                    <button type="submit" class="btn btn-ghost btn-sm text-error hover:bg-error/10 hover:text-error" aria-label="Sign out device">
                        <i class="bi bi-door-closed"></i> <span class="hidden sm:inline">Sign Out</span>
                    </button>
                </form>
            {/if}
        </div>
    {/each}

    {#if sessions.length > 1}
        <form method="POST" action="?/revokeOtherSessions" class="mt-2" use:enhance={() => { return async ({ update }) => { await update(); notify('success', 'All other devices signed out.'); }; }}>
            <button type="submit" class="btn btn-outline btn-error w-full sm:w-auto">
                <i class="bi bi-shield-lock"></i> Sign Out All Other Devices
            </button>
        </form>
    {/if}
</div>