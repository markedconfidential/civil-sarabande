// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}

	/**
	 * Environment variables exposed to the client. Read and validated once in
	 * src/lib/config.ts; everything else uses `config` from there.
	 */
	interface ImportMetaEnv {
		readonly VITE_API_URL?: string;
		readonly VITE_WS_URL?: string;
		readonly VITE_AUTH_MODE?: 'privy' | 'dev' | string;
		readonly VITE_PRIVY_APP_ID?: string;
		readonly VITE_CHAIN_ID?: string;
		readonly VITE_RPC_URL?: string;
		readonly VITE_ESCROW_CONTRACT_ADDRESS?: string;
		readonly VITE_USDC_CONTRACT_ADDRESS?: string;
		readonly VITE_EXPLORER_URL?: string;
	}
}

export {};
