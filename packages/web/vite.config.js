import { sveltekit } from '@sveltejs/kit/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		nodePolyfills({
			include: ['buffer', 'util']
		}),
		sveltekit()
	],
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'react'
	},
	optimizeDeps: {
		include: ['react', 'react-dom', '@privy-io/react-auth']
	}
});
