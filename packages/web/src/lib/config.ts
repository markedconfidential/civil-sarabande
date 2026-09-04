/**
 * Client runtime configuration.
 *
 * Every VITE_ variable is read and validated here, once. Nothing in this
 * module throws at import time: problems are collected into `configErrors`
 * so the home page can render them as a clear error card instead of the
 * app dying with a blank screen.
 *
 * Everything else (api.ts, websocket.ts, chain.ts, the pages) reads `config`
 * instead of touching `import.meta.env` directly.
 */

import { defineChain, isAddress, type Address, type Chain } from 'viem';
import { baseSepolia } from 'viem/chains';

export type AuthMode = 'privy' | 'dev';

export interface ClientConfig {
	apiUrl: string;
	wsUrl: string;
	authMode: AuthMode;
	privyAppId: string;
	chainId: number;
	rpcUrl: string;
	escrowAddress: Address;
	usdcAddress: Address;
	/** Block explorer base URL without a trailing slash, or null when unset */
	explorerUrl: string | null;
}

const env = import.meta.env as Record<string, string | undefined>;

function read(name: string): string {
	const value = env[name];
	return typeof value === 'string' ? value.trim() : '';
}

function stripTrailingSlash(url: string): string {
	return url.replace(/\/+$/, '');
}

const errors: string[] = [];

// ---- URLs -------------------------------------------------------------------

const apiUrl = stripTrailingSlash(read('VITE_API_URL') || 'http://localhost:3001');
const wsUrl = stripTrailingSlash(read('VITE_WS_URL') || apiUrl.replace(/^http/, 'ws'));

// ---- auth -------------------------------------------------------------------

const rawAuthMode = read('VITE_AUTH_MODE') || 'privy';
let authMode: AuthMode = 'privy';
if (rawAuthMode === 'privy' || rawAuthMode === 'dev') {
	authMode = rawAuthMode;
} else {
	errors.push(`VITE_AUTH_MODE must be "privy" or "dev" (got "${rawAuthMode}")`);
}

const privyAppId = read('VITE_PRIVY_APP_ID');
if (authMode === 'privy' && !privyAppId) {
	errors.push('VITE_PRIVY_APP_ID is required when VITE_AUTH_MODE=privy');
}

// ---- chain ------------------------------------------------------------------

const rawChainId = read('VITE_CHAIN_ID');
let chainId = 0;
if (!rawChainId) {
	errors.push('VITE_CHAIN_ID is required (84532 for Base Sepolia, 31337 for Anvil)');
} else if (!/^\d+$/.test(rawChainId)) {
	errors.push(`VITE_CHAIN_ID must be a number (got "${rawChainId}")`);
} else {
	chainId = Number(rawChainId);
	if (chainId !== 84532 && chainId !== 31337) {
		errors.push(`VITE_CHAIN_ID must be 84532 (Base Sepolia) or 31337 (Anvil), got ${chainId}`);
	}
}

const rpcUrl = stripTrailingSlash(read('VITE_RPC_URL'));
if (!rpcUrl) {
	errors.push('VITE_RPC_URL is required');
} else if (!/^https?:\/\//.test(rpcUrl)) {
	errors.push(`VITE_RPC_URL must start with http:// or https:// (got "${rpcUrl}")`);
}

function readAddress(name: string): Address {
	const value = read(name);
	if (!value) {
		errors.push(`${name} is required`);
		return '0x0000000000000000000000000000000000000000';
	}
	if (!isAddress(value)) {
		errors.push(`${name} is not a valid address (got "${value}")`);
		return '0x0000000000000000000000000000000000000000';
	}
	if (/^0x0{40}$/.test(value)) {
		errors.push(`${name} is the zero address; fill it from your deployment file`);
	}
	return value as Address;
}

const escrowAddress = readAddress('VITE_ESCROW_CONTRACT_ADDRESS');
const usdcAddress = readAddress('VITE_USDC_CONTRACT_ADDRESS');

const rawExplorer = read('VITE_EXPLORER_URL');
const explorerUrl = rawExplorer ? stripTrailingSlash(rawExplorer) : null;
if (explorerUrl && !/^https?:\/\//.test(explorerUrl)) {
	errors.push(`VITE_EXPLORER_URL must start with http:// or https:// (got "${explorerUrl}")`);
}

// ---- exports ----------------------------------------------------------------

export const config: Readonly<ClientConfig> = Object.freeze({
	apiUrl,
	wsUrl,
	authMode,
	privyAppId,
	chainId,
	rpcUrl,
	escrowAddress,
	usdcAddress,
	explorerUrl
});

/** Problems found while reading the environment. Empty when the config is usable. */
export const configErrors: readonly string[] = Object.freeze(errors);

export const isConfigValid = configErrors.length === 0;

/** Local Anvil chain (chain id 31337) pointed at the configured RPC. */
export const anvil: Chain = defineChain({
	id: 31337,
	name: 'Anvil',
	nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
	rpcUrls: {
		default: { http: [rpcUrl || 'http://127.0.0.1:8545'] }
	},
	testnet: true
});

/**
 * The viem chain the app talks to. Base Sepolia for 84532, Anvil for 31337.
 * When the chain id is invalid this falls back to Base Sepolia so the object
 * is always defined; `configErrors` carries the actual problem.
 */
export const chain: Chain =
	chainId === 31337
		? anvil
		: rpcUrl
			? defineChain({
					...baseSepolia,
					rpcUrls: {
						...baseSepolia.rpcUrls,
						default: { http: [rpcUrl] }
					}
				})
			: baseSepolia;

/** Explorer link for a transaction hash, or null when no explorer is configured. */
export function txUrl(hash: string | null | undefined): string | null {
	if (!explorerUrl || !hash) return null;
	return `${explorerUrl}/tx/${hash}`;
}

/** Explorer link for an address, or null when no explorer is configured. */
export function addressUrl(address: string | null | undefined): string | null {
	if (!explorerUrl || !address) return null;
	return `${explorerUrl}/address/${address}`;
}

/** Human-readable chain name for messages. */
export function chainName(id: number = chainId): string {
	if (id === 84532) return 'Base Sepolia';
	if (id === 31337) return 'Anvil (local)';
	return `chain ${id}`;
}
