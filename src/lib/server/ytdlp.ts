// FILE: src/lib/server/ytdlp.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { getSafeFilename } from './photouploads';

const execAsync = promisify(exec);

let ytDlpAvailable: boolean | null = null;

export async function isYtDlpAvailable() {
    if (ytDlpAvailable !== null) return ytDlpAvailable;
    try {
        await execAsync('yt-dlp --version');
        ytDlpAvailable = true;
    } catch {
        ytDlpAvailable = false;
    }
    return ytDlpAvailable;
}

export async function fetchVideoIfSupported(
    url: string, 
    diskFolder: string, 
    webFolder: string, 
    prefix: string,
    onStart?: (title: string) => Promise<void>
) {
    if (!(await isYtDlpAvailable())) {
        console.log("[yt-dlp] SKIPPED: yt-dlp is not installed or not in PATH.");
        return null;
    }
    
    try {
        // 1. Ask yt-dlp to dump the JSON metadata. If it succeeds, the site is supported!
        // We use a timeout to prevent hanging on unsupported/slow sites.
        const { stdout: jsonOut } = await execAsync(`yt-dlp --dump-json --no-playlist "${url}"`, { timeout: 15000 });
        const meta = JSON.parse(jsonOut);
        
        if (!meta || !meta.title) return null;
        
        // Signal to the logger that we successfully found a video and are about to start the heavy download
        if (onStart) await onStart(meta.title);

        const safeName = getSafeFilename(prefix + '-video');
        const finalDiskPath = `${diskFolder}/${safeName}.mp4`;
        const finalWebPath = `${webFolder}/${safeName}.mp4`;
        
        // 2. Download the best available MP4 configuration
        await execAsync(`yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${finalDiskPath}" --no-playlist "${url}"`);
        
        return {
            title: meta.title,
            description: meta.description || '',
            path: finalWebPath
        };
    } catch (e) {
        console.error("[yt-dlp] FAILED to process video url:", url);
        console.error(e);
        return null;
    }
}