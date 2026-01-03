import { sveltekit } from '@sveltejs/kit/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		react({
			include: '**/*.{tsx,jsx}'
		})
	],
	optimizeDeps: {
		include: ['react', 'react-dom', '@privy-io/react-auth']
	}
});
