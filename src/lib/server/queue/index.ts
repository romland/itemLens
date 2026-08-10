import { TaskQueue } from './TaskQueue';

/** Rembg (Background removal) is extremely memory/CPU intensive. Strictly 1 at a time. */
export const heavyMlQueue = new TaskQueue(1);

/** OCR (PaddleOCR) runs locally. Moderate limits to preserve CPU. */
export const lightMlQueue = new TaskQueue(2);

/** External APIs (Gemini, Groq) handle scale well, but limited to prevent rate limits. */
export const apiQueue = new TaskQueue(5);

/** Network I/O (Downloading PDFs, scraping URLs) is mostly waiting. */
export const ioQueue = new TaskQueue(10);