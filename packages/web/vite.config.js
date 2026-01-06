import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'react'
	},
	optimizeDeps: {
		include: ['react', 'react-dom', '@privy-io/react-auth']
	},
	resolve: {
		dedupe: ['react', 'react-dom']
	}
});
