import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import mkcert from 'vite-plugin-mkcert';
import express from 'express';

import { execSync } from 'child_process';
import pkg from './package.json' with { type: 'json' };

const gitHash = execSync('git rev-parse --short HEAD 2>/dev/null || echo "dev"').toString().trim();
const buildVersion = `v${pkg.version}-${gitHash}`;


// For dev-env (self signed cert)
// import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ command }) => ({
    define: {
        'import.meta.env.PUBLIC_APP_VERSION': JSON.stringify(buildVersion)
    },	
    server: {
        watch: {
            ignored: [
                '**/.git/**',
                '**/node_modules/**',
                '**/data/images/**',
                '**/services/**',
                '**/dev-dist/**',
                '**/dist/**',
                '**/old/**',
                '**/build/**',
                '**/*.db*',
                '**/*.log'
            ]
        },
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
		// as https and we can use full PWA capabilities (I hope at least?)
		// Commented this out in August 2026
		// https: false,
        // https: true,		
        allowedHosts: [
            '192.168.178.104'
        ]
    },
	ssr: {
        external: ['canvas', 'crop-node', 'get-pixels/node-pixels', 'pdf-parse', 'bcrypt']
    },
    
    // completely exclude them from Vite's pre-bundler:
    optimizeDeps: {
        exclude: ['canvas', 'crop-node', 'get-pixels/node-pixels', 'bcrypt']
    },

	plugins: [
        // Mount our out-of-band data directory during development
        {
            name: 'serve-data',
            configureServer(server) {
                server.middlewares.use('/images', express.static('data/images'));
            }
        },

        // Only run mkcert during local dev server
        command === 'serve' && mkcert({
            hosts: ['localhost', '127.0.0.1', '192.168.178.104']
        }),

		sveltekit(),
		SvelteKitPWA({
			srcDir: './src',
            mode: command === 'serve' ? 'development' : 'production',
			scope: '/',
			base: '/',
			selfDestroying: process.env.SELF_DESTROYING_SW === 'true',
			manifest: {
				short_name: 'ItemLens',
				name: 'ItemLens',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				// theme_color: "#ffffff",
				// background_color: "#ffffff",
                theme_color: "#1d232a",
                background_color: "#1d232a",
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
				share_target: {
					action: "/timeline?/capture",
					method: "POST",
					enctype: "multipart/form-data",
					params: {
						title: "title",
						text: "text",
						url: "url",
						files: [
							{ name: "images", accept: ["image/*", "video/*"] }
						]
					}
				}				  
			},
			workbox: {
				globIgnores: ['**/client/images/u/**', '**/client/images/tests/**', '**/itemlens.png'],
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
                navigateFallback: null, // CRITICAL: Stop SW from serving poisoned HTML shells on Ctrl+R
				cleanupOutdatedCaches: true,
                skipWaiting: true,      // Kills the old Service Worker instantly on update
                clientsClaim: true,     // Takes control of the open tab immediately
				runtimeCaching: [
					{
						// Cache API calls and __data.json with NetworkFirst.
						// CRITICAL: Exclude /api/events! Caching an SSE stream crashes Workbox.
						urlPattern: ({ request, url }) => {
							if (url.pathname.includes('/api/events')) return false;
							return url.pathname.startsWith('/api/') ||
							       url.pathname.endsWith('__data.json') ||
							       url.search.includes('__data.json');
						},						
						handler: 'NetworkFirst',
						options: {
							cacheName: 'app-dynamic-data',
							networkTimeoutSeconds: 10,
							expiration: {
								maxEntries: 200,
								maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
							},
							cacheableResponse: {
								statuses: [0, 200]
							}
						}
					}
				]				
			},
			devOptions: {
				enabled: true,
				suppressWarnings: process.env.SUPPRESS_WARNING === 'true',
				type: 'module',
                // navigateFallback: '/',
			},
			// if you have shared info in svelte config file put in a separate module and use it also here
			kit: {
				includeVersionFile: true,
			},
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


		// {
		// 	// This is to make sure we're not fucking things up.
		// 	name: 'dump-server-handles',
		// 	closeBundle() {
        //         if (command !== 'build') return;
		// 		// Delay dump so it runs AFTER adapter-node finishes its work
		// 		setTimeout(() => {
		// 		console.log('\n========================================');
		// 		console.log('   ACTUAL UNCLOSED HANDLES (AFTER ADAPTER)');
		// 		console.log('========================================');
				
		// 		const handles = (process as any)._getActiveHandles?.() || [];
		// 		handles.forEach((h: any, i: number) => {
		// 			const type = h?.constructor?.name || typeof h;
		// 			if (type === 'TTY' || type === 'WriteStream' || type === 'ReadStream' || h.fd === 1 || h.fd === 2) return;
					
		// 			console.log(`[Handle #${i}] Type: ${type}`);
		// 			if (h.spawnfile) console.log(`   -> Spawned Process: ${h.spawnfile}`);
		// 			if (h._idleTimeout) console.log(`   -> Active Timer: ${h._idleTimeout}ms`);
		// 			if (h.filename) console.log(`   -> File: ${h.filename}`);
		// 		});
		// 		console.log('========================================\n');
		// 		}, 2000);
		// 	}
		// },
        // {
		// 	// Well, let's kill ourselves after build then, something Rust or C++ is hanging.
        //     name: 'terminate-native-threads-after-build',
        //     closeBundle() {
        //         if (command !== 'build') return;
        //         setTimeout(() => process.exit(0), 3000);
        //     }
        // }

	],
}));
