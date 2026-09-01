<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/stores";
    import { notify } from "$lib/client/notifications";
    import ActionCard from "$lib/components/ActionCard.svelte";
    import pageTitle from '$lib/stores';

    pageTitle.set("System Administration");

    let editUserId: number | null = null;
    let storageMetrics: any = null;
    let loadingStorage = false;

    function createEnhancer() {
        return async ({ result, update }: any) => {
            if (result.type === 'success' || result.type === 'redirect') {
                notify('success', result.data?.message || 'Saved successfully');
                editUserId = null;
            } else if (result.type === 'failure' || result.type === 'error') {
                notify('error', result.data?.message || 'An error occurred');
            }
            await update({ reset: false });
        };
    }

    async function loadStorageMetrics() {
        if (storageMetrics || loadingStorage) return;
        loadingStorage = true;
        try {
            const res = await fetch('/api/storage-metrics');
            if (res.ok) storageMetrics = await res.json();
        } finally {
            loadingStorage = false;
        }
    }
</script>

<div class="max-w-4xl mx-auto flex flex-col gap-8">
    <div class="bg-base-100 border border-error/20 shadow-sm rounded-xl p-6 relative overflow-hidden">
        <div class="absolute top-0 right-0 bg-error text-error-content text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Admin Only</div>
        <h2 class="text-2xl font-bold mb-6">User Management</h2>
        
        <h3 class="font-bold text-lg mb-4 text-error"><i class="bi bi-shield-lock"></i> Add User</h3>
        <form method="POST" action="?/createUser" use:enhance={createEnhancer} class="flex flex-col sm:flex-row gap-2 mb-6">
            <input type="text" name="username" placeholder="Username" class="input input-bordered w-full" required autocomplete="off">
            <input type="password" name="password" placeholder="Password" class="input input-bordered w-full" required autocomplete="new-password">
            <button type="submit" class="btn btn-error text-white">Create User</button>
        </form>

        <div class="overflow-x-auto bg-base-200 rounded-lg mb-8 border border-base-300">
            <table class="table table-sm">
                <thead><tr><th>Username</th><th>Name</th><th>Role</th><th></th></tr></thead>
                <tbody>
                    {#each $page.data.allUsers || [] as u}
                        {#if editUserId === u.id}
                            <tr>
                                <td colspan="4" class="p-4 bg-base-300">
                                    <form method="POST" action="?/updateUser" use:enhance={createEnhancer} class="flex flex-col gap-3">
                                        <input type="hidden" name="id" value={u.id}>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div class="form-control">
                                                <label class="label"><span class="label-text">Name</span></label>
                                                <input type="text" name="name" value={u.name || ''} class="input input-sm input-bordered bg-base-100" />
                                            </div>
                                            <div class="form-control">
                                                <label class="label"><span class="label-text">Email</span></label>
                                                <input type="email" name="email" value={u.email || ''} class="input input-sm input-bordered bg-base-100" />
                                            </div>
                                            <div class="form-control">
                                                <label class="label"><span class="label-text">New Password (leave blank to keep)</span></label>
                                                <input type="password" name="password" class="input input-sm input-bordered bg-base-100" placeholder="******" />
                                            </div>
                                            <div class="form-control justify-end pb-1">
                                                <label class="label cursor-pointer justify-start gap-3 w-fit">
                                                    <input type="checkbox" name="isAdmin" value="true" checked={u.isAdmin} class="checkbox checkbox-sm checkbox-error" />
                                                    <span class="label-text font-bold text-error">System Admin</span>
                                                </label>
                                                <label class="label cursor-pointer justify-start gap-3 w-fit mt-[-10px]">
                                                    <input type="checkbox" name="canCreateInventories" value="true" checked={u.canCreateInventories} class="checkbox checkbox-sm checkbox-primary" />
                                                    <span class="label-text font-bold text-primary">Can Create Collections</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div class="flex gap-2 justify-end mt-2">
                                            <button type="button" class="btn btn-sm btn-ghost" on:click={() => editUserId = null}>Cancel</button>
                                            <button type="submit" class="btn btn-sm btn-primary">Save Changes</button>
                                        </div>
                                    </form>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td><span class="font-bold">{u.username}</span></td>
                                <td>{u.name || '-'}</td>
                                <td>
                                    {#if u.isAdmin}<span class="badge badge-error badge-sm text-white">Admin</span>{:else}<span class="badge badge-ghost badge-sm">User</span>{/if}
                                </td>
                                <td class="text-right">
                                    <button type="button" class="btn btn-ghost btn-xs" on:click={() => editUserId = u.id}><i class="bi bi-pencil"></i> Edit</button>
                                </td>
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>
        </div>
    </div>

    <div class="bg-base-100 border border-error/20 shadow-sm rounded-xl p-6 relative overflow-hidden">
        <h2 class="text-2xl font-bold mb-6">System Status</h2>
        
        <div class="bg-base-200/50 rounded-xl p-5 mb-6 border border-base-200">
            <div class="flex justify-between items-center mb-4">
                <h4 class="font-bold text-sm uppercase tracking-wider text-gray-500">Storage Usage</h4>
                {#if !storageMetrics}
                    <button type="button" class="btn btn-xs btn-outline rounded-lg" on:click={loadStorageMetrics}>
                        {#if loadingStorage}<span class="loading loading-spinner loading-xs"></span>{:else}Calculate{/if}
                    </button>
                {/if}
            </div>
            {#if storageMetrics}
                {@const dbMb = (storageMetrics.dbBytes / (1024 * 1024)).toFixed(1)}
                {@const uploadsMb = (storageMetrics.uploadsBytes / (1024 * 1024)).toFixed(1)}
                {@const totalMb = ((storageMetrics.dbBytes + storageMetrics.uploadsBytes) / (1024 * 1024)).toFixed(1)}
                {@const freeGb = storageMetrics.freeBytes ? (storageMetrics.freeBytes / (1024 * 1024 * 1024)).toFixed(1) : null}
                <div class="flex items-end justify-between mb-2">
                    <span class="text-2xl font-bold">{totalMb} <span class="text-sm font-medium text-gray-400">MB Used</span></span>
                    {#if freeGb !== null}
                        <span class="text-sm font-bold text-base-content/70">{freeGb} GB <span class="font-medium text-gray-400">Disk Free</span></span>
                    {/if}
                </div>
                <!-- Stacked bar -->
                <div class="w-full h-3 bg-base-300 rounded-full overflow-hidden flex shadow-inner mb-3">
                    <div class="bg-primary h-full" style="width: {(storageMetrics.dbBytes / storageMetrics.totalBytes) * 100}%" title="Database ({dbMb} MB)"></div>
                    <div class="bg-secondary h-full" style="width: {(storageMetrics.uploadsBytes / storageMetrics.totalBytes) * 100}%" title="Media & Uploads ({uploadsMb} MB)"></div>
                </div>
                <div class="flex gap-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    <div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-primary"></div> Database ({dbMb} MB)</div>
                    <div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-secondary"></div> Media ({uploadsMb} MB)</div>
                </div>
            {:else if loadingStorage}
                <div class="w-full h-3 bg-base-300 rounded-full overflow-hidden mb-3 animate-pulse"></div>
                <div class="flex gap-4 text-[10px] font-bold uppercase tracking-wider text-gray-500 opacity-50">
                    <div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-base-300"></div> Scanning...</div>
                </div>
            {/if}
        </div>

        <div class="bg-base-200/50 rounded-xl p-5 border border-base-200 mb-6">
            <div class="flex items-center gap-2 mb-4">
                <h4 class="font-bold text-sm uppercase tracking-wider text-gray-500 m-0">System Diagnostics</h4>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Dependencies -->
                <div>
                    <h5 class="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">Host Dependencies</h5>
                    <ul class="flex flex-col gap-3">
                        <li class="flex items-start gap-3">
                            <i class="bi {$page.data.deps.ffmpeg ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-error'} text-lg mt-0.5"></i>
                            <div>
                                <div class="font-bold text-sm leading-tight">FFmpeg</div>
                                <div class="text-xs text-gray-500 mt-0.5">Needed for extracting frames from video files. {$page.data.deps.ffmpeg ? '' : 'Install via `sudo apt-get install ffmpeg`'}</div>
                            </div>
                        </li>
                        <li class="flex items-start gap-3">
                            <i class="bi {$page.data.deps.pdftoppm ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-error'} text-lg mt-0.5"></i>
                            <div>
                                <div class="font-bold text-sm leading-tight">Poppler (pdftoppm)</div>
                                <div class="text-xs text-gray-500 mt-0.5">Needed for generating PDF thumbnails. {$page.data.deps.pdftoppm ? '' : 'Install via `sudo apt-get install poppler-utils`'}</div>
                            </div>
                        </li>
                        <li class="flex items-start gap-3">
                            <i class="bi {$page.data.deps.ytdlp ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-warning'} text-lg mt-0.5"></i>
                            <div>
                                <div class="font-bold text-sm leading-tight">yt-dlp</div>
                                <div class="text-xs text-gray-500 mt-0.5">Optional. Needed to download videos from links (YouTube, Twitter, etc). {$page.data.deps.ytdlp ? '' : 'Install via pip or brew.'}</div>
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- Docker Containers -->
                <div>
                    <h5 class="text-xs font-bold uppercase tracking-wider text-base-content/50 mb-3">Microservices (Docker)</h5>
                    <ul class="flex flex-col gap-3">
                        <li class="flex items-start gap-3">
                            <i class="bi {$page.data.deps.rembg ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-warning'} text-lg mt-0.5"></i>
                            <div>
                                <div class="font-bold text-sm leading-tight">RemBG (Background Removal)</div>
                                <div class="text-xs text-gray-500 mt-0.5">Optional. Runs on port 7000. {$page.data.deps.rembg ? '' : 'Start container for automatic background removal.'}</div>
                            </div>
                        </li>
                        <li class="flex items-start gap-3">
                            <i class="bi {$page.data.deps.paddleocr ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-warning'} text-lg mt-0.5"></i>
                            <div>
                                <div class="font-bold text-sm leading-tight">PaddleOCR</div>
                                <div class="text-xs text-gray-500 mt-0.5">Optional. Runs on port 8000. {$page.data.deps.paddleocr ? '' : 'Start container for local text extraction.'}</div>
                            </div>
                        </li>
                        <li class="flex items-start gap-3">
                            <i class="bi {$page.data.deps.singlefile ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-warning'} text-lg mt-0.5"></i>
                            <div>
                                <div class="font-bold text-sm leading-tight">SingleFile (Web Scraper)</div>
                                <div class="text-xs text-gray-500 mt-0.5">Optional. Runs on port 8001. {$page.data.deps.singlefile ? '' : 'Start container to archive full webpages from links.'}</div>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
            
            <div class="mt-6 pt-4 border-t border-base-200/50">
                <div class="flex items-center gap-2 mb-1">
                    <i class="bi bi-key text-primary"></i>
                    <h5 class="font-bold text-sm">API Keys Configuration</h5>
                </div>
                <div class="text-xs text-gray-500">
                    To use AI features, ensure you have API keys (Gemini, Groq, etc) configured in your <code>.env</code> file. Check the setup guide to get free keys from Google AI Studio and Groq Console.
                </div>
            </div>
        </div>

        <div class="flex flex-col gap-3">
            <ActionCard
                title="System Activity Log"
                href="/activity"
                icon="bi-activity"
                iconColorClass="bg-info/10 text-info"
                variant="flat"
            />
            <ActionCard
                title="Backup Database"
                href="/api/backup"
                target="_blank"
                icon="bi-database-down"
                iconColorClass="bg-success/10 text-success"
                variant="flat"
                showChevron={false}
            >
                <i class="bi bi-download text-gray-400"></i>
            </ActionCard>
        </div>
    </div>
</div>