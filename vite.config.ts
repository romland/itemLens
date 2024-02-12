import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

import { SvelteKitPWA } from '@vite-pwa/sveltekit';

// For dev-env (self signed cert)
// import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			srcDir: './src',
			mode: 'development',
			scope: '/',
			base: '/',
			selfDestroying: process.env.SELF_DESTROYING_SW === 'true',
			manifest: {
				short_name: 'ItemLens',
				name: 'ItemLens',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				theme_color: "#ffffff",
				background_color: "#ffffff",
				"icons": [
					{
					  "src": "images/pwa-64x64.png",
					  "sizes": "64x64",
					  "type": "image/png"
					},
					{
					  "src": "images/pwa-192x192.png",
					  "sizes": "192x192",
					  "type": "image/png"
					},
					{
					  "src": "images/pwa-512x512.png",
					  "sizes": "512x512",
					  "type": "image/png"
					},
					{
					  "src": "images/maskable-icon-512x512.png",
					  "sizes": "512x512",
					  "type": "image/png",
					  "purpose": "maskable"
					}
				  ],
			},
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
			},
			devOptions: {
				enabled: true,
				suppressWarnings: process.env.SUPPRESS_WARNING === 'true',
				type: 'module',
				navigateFallback: '/',
			},
			// if you have shared info in svelte config file put in a separate module and use it also here
			kit: {
				includeVersionFile: true,
			}
		}),

		// For dev-env (self signed cert)
		// basicSsl({
		// 	// /** name of certification */
		// 	// name: 'Vinventory',
		// 	// /** custom trust domains */
		// 	// domains: ['*.custom.com'],
		// 	// /** custom certification directory */
		// 	// certDir: '/Users/.../.devServer/cert'
		//   })
	],
	// JR NOTE: 
	// For local development and PWA, I want to test with phone on LAN using a reverse proxy
	// via dev.providi.nl. I have issues getting websockets to work (for PWA). A hint is that
	// Vite is the problem: https://github.com/vitejs/vite/issues/1653 
	// 
	// I am note certain if it's Vite's, Apache's or my own fault yet.
	//
	// This has information about doing this with Apache:
	// https://github.com/vitejs/vite/discussions/6473
	// server: {
	// 	hmr: {
	// 	  clientPort: 443,
	// 	  host: 'dev.providi.nl',
	// 	  port: 5173,
	// 	  protocol: 'wss'
	// 	}
	//   }
	// server: {
	// 	// host: "0.0.0.0",
	// 	port: 5173,
	// 	hmr: {
	// 	  port: 5173,
	// 	  clientPort: 443,
	// 	  protocol: 'wss'
	// 	},
	//   },
	//
	// Instead of the above, I went with a self-signed cert and the plugin:
	// https://github.com/vitejs/vite-plugin-basic-ssl
	// It still means you have to accept a "dodgy site", but at least it's flagged
	// as https and we can use full WPA capabilities (I hope at least?)
	server: {
		https: false,
	}
});
