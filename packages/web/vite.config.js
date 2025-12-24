import { sveltekit } from '@sveltejs/kit/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		react({
			// Only apply React plugin to .tsx files in the privy directory
			include: '**/*.tsx'
		})
	],
	optimizeDeps: {
		include: ['react', 'react-dom', '@privy-io/react-auth']
	}
});

