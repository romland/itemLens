import { TaskQueue } from './TaskQueue';

/** Rembg (Background removal) is extremely memory/CPU intensive. Strictly 1 at a time. */
export const heavyMlQueue = new TaskQueue('HeavyML', 1);

/** OCR (PaddleOCR) runs locally. Strictly 1 at a time to prevent pegging all cores via OpenMP. */
export const lightMlQueue = new TaskQueue('LightML (OCR)', 1);

/** External APIs (Gemini, Groq) handle scale well, but limited to prevent rate limits. */
export const apiQueue = new TaskQueue('External API', 5);

/** Network I/O (Downloading PDFs, scraping URLs) is mostly waiting. */
export const ioQueue = new TaskQueue('Disk/DB I/O', 10);
