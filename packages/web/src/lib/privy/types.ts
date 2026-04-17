import type { User } from '@privy-io/react-auth';

/**
 * Minimal EIP-1193 provider surface needed by the app.
 */
export interface EthereumProviderLike {
	request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

export interface PrivyLike {
	getEthereumProvider?: () => Promise<EthereumProviderLike | null>;
}

export interface PrivyWindowBindings {
	__privyLogin?: () => void;
	__privyLogout?: () => Promise<void>;
	__privyGetAccessToken?: () => Promise<string | null>;
	privyProvider?: EthereumProviderLike;
	ethereum?: EthereumProviderLike;
	privy?: PrivyLike;
}

export type PrivyEvent =
	| { type: 'ready' }
	| { type: 'authenticated'; user: User; accessToken: string | null }
	| { type: 'logout' }
	| { type: 'wallet'; address: string | null }
	| { type: 'error'; message: string };
