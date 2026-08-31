/**
 * Extracts the base filename from a URL or path, stripping off query parameters and hash fragments.
 */
export function getCleanPath(path: string | null | undefined): string {
    return (path || '').toLowerCase().split('#')[0].split('?')[0];
}

export function isVideo(path: string | null | undefined): boolean {
    return getCleanPath(path).match(/\.(mp4|webm|mov|mkv|ogg)$/i) !== null;
}

export function isImage(path: string | null | undefined): boolean {
    return getCleanPath(path).match(/\.(jpg|jpeg|png|webp|gif|svg)$/i) !== null;
}

export function isEpub(path: string | null | undefined): boolean {
    return getCleanPath(path).match(/\.epub$/i) !== null;
}

export function isPdf(path: string | null | undefined): boolean {
    return getCleanPath(path).match(/\.pdf$/i) !== null;
}

export function isMarkdown(path: string | null | undefined): boolean {
    return getCleanPath(path).match(/\.(md|txt)$/i) !== null;
}

export function isHtml(path: string | null | undefined): boolean {
    return getCleanPath(path).match(/\.(html|htm)$/i) !== null;
}

export function isMedia(path: string | null | undefined): boolean {
    return isVideo(path) || isImage(path);
}