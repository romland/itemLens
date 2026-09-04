<script lang="ts">
    export let diagnostics: any = null;
</script>

{#if diagnostics}
<div class="flex flex-col gap-6 w-full">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-base-200/50 pb-4">
        <div class="flex items-center gap-3">
            <i class="bi bi-cpu text-2xl text-gray-400"></i>
            <h2 class="text-xl font-bold text-gray-500 m-0">System Diagnostics</h2>
        </div>
        <div class="text-right">
            <div class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Host Memory</div>
            <div class="text-lg font-bold text-base-content leading-none mt-1">{diagnostics.totalRamGB.toFixed(1)} GB</div>
        </div>
    </div>

    <!-- Microservices (Docker) -->
    <div>
        <h5 class="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">Microservices (Docker)</h5>
        <ul class="flex flex-col gap-3">
            {#each diagnostics.microservices as ms}
                <li class="flex items-start gap-3">
                    {#if ms.running}
                        <i class="bi bi-check-circle-fill text-success text-lg mt-0.5"></i>
                    {:else if diagnostics.totalRamGB >= ms.ram}
                        <i class="bi bi-dash-circle-fill text-warning text-lg mt-0.5" title="Not running, but host has enough RAM"></i>
                    {:else}
                        <i class="bi bi-x-circle-fill text-error text-lg mt-0.5" title="Host does not have enough RAM"></i>
                    {/if}
                    
                    <div>
                        <div class="font-bold text-sm leading-tight">{ms.name} <span class="font-normal opacity-50 text-xs">({ms.ram}GB req)</span></div>
                        <div class="text-xs mt-0.5 {ms.running ? 'text-gray-500' : (diagnostics.totalRamGB >= ms.ram ? 'text-gray-500' : 'text-error')}">
                            {#if ms.running}
                                Running on port {ms.port}.
                            {:else if diagnostics.totalRamGB >= ms.ram}
                                Offline. Host meets memory requirement.
                            {:else}
                                Offline. Host does not meet {ms.ram}GB memory requirement.
                            {/if}
                        </div>
                    </div>
                </li>
            {/each}
        </ul>
    </div>

    <!-- AI Providers -->
    <div>
        <h5 class="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">AI Providers</h5>
        <ul class="flex flex-col gap-3">
            <li class="flex items-start gap-3">
                <i class="bi {diagnostics.apis.gemini ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-error'} text-lg mt-0.5"></i>
                <div>
                    <div class="font-bold text-sm leading-tight">Gemini API Key</div>
                    <div class="text-xs text-gray-500 mt-0.5">Required for Vision Classification & Deduplication.</div>
                </div>
            </li>
            <li class="flex items-start gap-3">
                <i class="bi {diagnostics.apis.groq ? 'bi-check-circle-fill text-success' : 'bi-dash-circle-fill text-warning'} text-lg mt-0.5"></i>
                <div>
                    <div class="font-bold text-sm leading-tight">Groq API Key</div>
                    <div class="text-xs text-gray-500 mt-0.5">Optional. Powers lightning-fast Voice Search.</div>
                </div>
            </li>
        </ul>
    </div>

    <!-- Host Dependencies -->
    <div>
        <h5 class="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">Host Dependencies</h5>
        <ul class="flex flex-col gap-3">
            <li class="flex items-start gap-3">
                <i class="bi {diagnostics.deps.ffmpeg ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-error'} text-lg mt-0.5"></i>
                <div>
                    <div class="font-bold text-sm leading-tight">FFmpeg</div>
                    <div class="text-xs text-gray-500 mt-0.5">Extracts frames from video files. {diagnostics.deps.ffmpeg ? '' : 'Install via `apt-get install ffmpeg`'}</div>
                </div>
            </li>
            <li class="flex items-start gap-3">
                <i class="bi {diagnostics.deps.pdftoppm ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-error'} text-lg mt-0.5"></i>
                <div>
                    <div class="font-bold text-sm leading-tight">Poppler (pdftoppm)</div>
                    <div class="text-xs text-gray-500 mt-0.5">Generates PDF thumbnails. {diagnostics.deps.pdftoppm ? '' : 'Install via `apt-get install poppler-utils`'}</div>
                </div>
            </li>
            <li class="flex items-start gap-3">
                <i class="bi {diagnostics.deps.ytdlp ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-warning'} text-lg mt-0.5"></i>
                <div>
                    <div class="font-bold text-sm leading-tight">yt-dlp</div>
                    <div class="text-xs text-gray-500 mt-0.5">Downloads linked videos. {diagnostics.deps.ytdlp ? '' : 'Install via pip or brew.'}</div>
                </div>
            </li>
        </ul>
    </div>
</div>
{/if}