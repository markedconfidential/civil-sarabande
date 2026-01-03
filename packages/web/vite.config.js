import { sveltekit } from '@sveltejs/kit/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		react({
			include: '**/*.{tsx,jsx}'
		}),
		sveltekit()
	],
	optimizeDeps: {
		include: ['react', 'react-dom', '@privy-io/react-auth']
	}
});
