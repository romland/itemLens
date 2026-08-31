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

export function decodeHtmlEntities(str: string): string {
    if (!str) return '';
    const translate_re = /&(nbsp|amp|quot|lt|gt|#39);/g;
    const translate: Record<string, string> = { "nbsp":" ", "amp" : "&", "quot": "\"", "lt"  : "<", "gt"  : ">", "#39": "'" };
    return str.replace(translate_re, (match, entity) => translate[entity])
              .replace(/&#(\d+);/gi, (match, numStr) => String.fromCharCode(parseInt(numStr, 10)));
}
