import { handler } from './build/handler.js';
import express from 'express';
import path from 'path';

const app = express();

// 1. Let Express natively serve the 5GB out-of-band media folder. 
// This automatically handles Range requests (video scrubbing), ETags, and caching.
app.use('/images', express.static(path.join(process.cwd(), 'data/images'), {
    maxAge: '1y',
    immutable: true
}));

// 2. Hand everything else off to SvelteKit's routing engine
app.use(handler);

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 SvelteKit Custom Server running on port ${port}`);
    console.log(`📁 Serving media from: ${path.join(process.cwd(), 'data/images')}`);
});