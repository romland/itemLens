import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
//import { dev } from '$app/environment'


/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
		}),
		csrf: {
			// I just cannot be arsed to fiddle with CORS issues right now;
			// flip off Svelte Kit's checks when on dev-env.
			checkOrigin: (process.env.NODE_ENV === "development" ? false : true),
		}
	}
};

export default config;
