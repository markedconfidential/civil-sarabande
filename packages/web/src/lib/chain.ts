/**
 * Chain access for the web client.
 *
 * Replaces the old `contract.ts`. One `WalletSource` abstraction hides the
 * difference between the two auth modes:
 *
 * - privy: the EIP-1193 provider Privy exposes (`window.ethereum` or
 *   `window.privyProvider`), with the account taken from the auth store's
 *   wallet address. `requestAddresses` is only used as a fallback when the
 *   store has no address.
 * - dev:   a viem local account from the selected dev identity's private key
 *   over `http(config.rpcUrl)`.
 *
 * Reads always go over `http(config.rpcUrl)` so they work before a wallet is
 * connected and never depend on the wallet's own RPC.
 *
 * All amounts are USDC base units (bigint). Convert with `usdcToUnits` /
 * `unitsToUsdc` from the shared package; never float math.
 */

import {
	BaseError,
	ContractFunctionRevertedError,
	createPublicClient,
	createWalletClient,
	custom,
	http,
	type Account,
	type Address,
	type Hash,
	type Hex,
	type PublicClient,
	type TransactionReceipt,
	type WalletClient
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
	ERC20_ABI,
	ESCROW_STATUS,
	GAME_ESCROW_ABI,
	unitsToUsdc,
	usdcToUnits,
	type EscrowChainStatus
} from '@civil-sarabande/shared';
import { get } from 'svelte/store';
import { chain, chainName, config, txUrl } from './config';
import { authStore } from './auth';
import type { EthereumProviderLike } from './privy/types';

export { usdcToUnits, unitsToUsdc };

// ============================================================================
// Errors
// ============================================================================

/** A chain failure with a short, human-readable message. */
export class ChainError extends Error {
	readonly cause?: unknown;
	readonly userRejected: boolean;

	constructor(message: string, options: { cause?: unknown; userRejected?: boolean } = {}) {
		super(message);
		this.name = 'ChainError';
		this.cause = options.cause;
		this.userRejected = options.userRejected ?? false;
	}
}

function messageOf(err: unknown): string {
	if (err instanceof BaseError) return err.shortMessage || err.message;
	if (err instanceof Error) return err.message;
	return String(err);
}

function fullTextOf(err: unknown): string {
	if (err instanceof BaseError) {
		return [err.shortMessage, err.details, err.message, messageOf(err.cause)]
			.filter(Boolean)
			.join(' ');
	}
	if (err instanceof Error) return `${err.message} ${messageOf((err as { cause?: unknown }).cause)}`;
	return String(err);
}

/** Convert any thrown value into a short message a player can act on. */
export function toChainErrorMessage(err: unknown): string {
	if (err instanceof ChainError) return err.message;

	const text = fullTextOf(err);
	const lower = text.toLowerCase();
	const code = (err as { code?: number })?.code;

	if (
		code === 4001 ||
		lower.includes('user rejected') ||
		lower.includes('user denied') ||
		lower.includes('rejected the request')
	) {
		return 'You rejected the request in your wallet.';
	}
	if (lower.includes('insufficient allowance')) {
		return 'USDC allowance is too low. Approve the escrow contract and try again.';
	}
	if (lower.includes('transfer amount exceeds balance') || lower.includes('insufficient balance')) {
		return 'Not enough USDC in your wallet for this stake.';
	}
	if (lower.includes('insufficient funds')) {
		return 'Not enough ETH in your wallet to pay for gas.';
	}
	if (lower.includes('chain mismatch') || lower.includes('does not match')) {
		return `Your wallet is on the wrong network. Switch to ${chainName()}.`;
	}
	if (lower.includes('failed to fetch') || lower.includes('http request failed')) {
		return `Cannot reach the RPC at ${config.rpcUrl}.`;
	}

	if (err instanceof BaseError) {
		const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
		if (revert instanceof ContractFunctionRevertedError) {
			const reason = revert.reason || revert.data?.errorName;
			if (reason) return `Contract rejected the call: ${reason}`;
		}
		return err.shortMessage || err.message;
	}
	if (err instanceof Error) return err.message;
	return 'Unknown chain error';
}

function wrap(err: unknown): ChainError {
	if (err instanceof ChainError) return err;
	const message = toChainErrorMessage(err);
	return new ChainError(message, {
		cause: err,
		userRejected: message.startsWith('You rejected')
	});
}

// ============================================================================
// Wallet source
// ============================================================================

export interface WalletSource {
	readonly mode: 'privy' | 'dev';
	/** The account that signs transactions */
	getAccount(): Promise<Account>;
	/** A viem wallet client bound to the configured chain */
	getWalletClient(): Promise<WalletClient>;
	/** Ensure the signer is on the configured chain (no-op for local accounts) */
	switchChain(): Promise<void>;
}

function assertConfig(): void {
	if (!config.chainId) throw new ChainError('VITE_CHAIN_ID is not configured.');
	if (!config.rpcUrl) throw new ChainError('VITE_RPC_URL is not configured.');
}

const RPC_TIMEOUT_MS = 20_000;

let publicClient: PublicClient | null = null;

/** Read-only client over the configured RPC. */
export function getPublicClient(): PublicClient {
	assertConfig();
	if (!publicClient) {
		publicClient = createPublicClient({
			chain,
			transport: http(config.rpcUrl, { timeout: RPC_TIMEOUT_MS })
		});
	}
	return publicClient;
}

function getProvider(): EthereumProviderLike {
	if (typeof window === 'undefined') {
		throw new ChainError('Wallet is only available in the browser.');
	}
	const provider = window.ethereum || window.privyProvider;
	if (!provider) {
		throw new ChainError('Wallet not connected. Sign in and wait for your wallet to load.');
	}
	return provider;
}

function isRpcError(err: unknown, code: number): boolean {
	const anyErr = err as { code?: number; data?: { originalError?: { code?: number } } };
	return anyErr?.code === code || anyErr?.data?.originalError?.code === code;
}

const privySource: WalletSource = {
	mode: 'privy',

	async getAccount(): Promise<Account> {
		const stored = get(authStore).walletAddress;
		if (stored) {
			return { address: stored as Address, type: 'json-rpc' };
		}
		// Fallback only: the store normally carries the embedded wallet address.
		const provider = getProvider();
		const [address] = await createWalletClient({
			chain,
			transport: custom(provider)
		}).requestAddresses();
		if (!address) {
			throw new ChainError('Wallet has no accounts. Sign in again.');
		}
		return { address, type: 'json-rpc' };
	},

	async getWalletClient(): Promise<WalletClient> {
		const provider = getProvider();
		const account = await this.getAccount();
		return createWalletClient({ account, chain, transport: custom(provider) });
	},

	async switchChain(): Promise<void> {
		const provider = getProvider();
		const hexId: Hex = `0x${chain.id.toString(16)}`;

		try {
			const current = (await provider.request({ method: 'eth_chainId' })) as string;
			if (typeof current === 'string' && parseInt(current, 16) === chain.id) return;
		} catch {
			// Fall through and ask for the switch anyway.
		}

		try {
			await provider.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: hexId }]
			});
			return;
		} catch (err) {
			if (!isRpcError(err, 4902)) throw wrap(err);
		}

		// Chain unknown to the wallet: add it, which also switches.
		try {
			await provider.request({
				method: 'wallet_addEthereumChain',
				params: [
					{
						chainId: hexId,
						chainName: chain.name,
						nativeCurrency: chain.nativeCurrency,
						rpcUrls: [config.rpcUrl],
						blockExplorerUrls: config.explorerUrl ? [config.explorerUrl] : undefined
					}
				]
			});
		} catch (err) {
			throw wrap(err);
		}
	}
};

let devAccountCache: { key: Hex; account: Account } | null = null;

const devSource: WalletSource = {
	mode: 'dev',

	async getAccount(): Promise<Account> {
		const identity = get(authStore).devIdentity;
		if (!identity) {
			throw new ChainError('No dev identity selected. Pick one on the dev-login page.');
		}
		if (!devAccountCache || devAccountCache.key !== identity.privateKey) {
			devAccountCache = {
				key: identity.privateKey,
				account: privateKeyToAccount(identity.privateKey)
			};
		}
		return devAccountCache.account;
	},

	async getWalletClient(): Promise<WalletClient> {
		assertConfig();
		const account = await this.getAccount();
		return createWalletClient({
			account,
			chain,
			transport: http(config.rpcUrl, { timeout: RPC_TIMEOUT_MS })
		});
	},

	async switchChain(): Promise<void> {
		// A local account signs for whatever chain the client is bound to.
	}
};

/** The wallet source for the configured auth mode. */
export const walletSource: WalletSource = config.authMode === 'dev' ? devSource : privySource;

/** A wallet client for the current user, bound to the configured chain. */
export function getWalletClient(): Promise<WalletClient> {
	return walletSource.getWalletClient();
}

/** The connected wallet's address. */
export async function getAddress(): Promise<Address> {
	const account = await walletSource.getAccount();
	return account.address;
}

/**
 * Make sure the signer is on the configured chain. Privy mode issues
 * `wallet_switchEthereumChain` (adding the chain on 4902); dev mode is a
 * no-op. Called before every write.
 */
export function switchToConfiguredChain(): Promise<void> {
	return walletSource.switchChain();
}

// ============================================================================
// Reads
// ============================================================================

/** USDC balance in base units for `address` (defaults to the connected wallet). */
export async function getUsdcBalance(address?: Address): Promise<bigint> {
	try {
		const owner = address ?? (await getAddress());
		return await getPublicClient().readContract({
			address: config.usdcAddress,
			abi: ERC20_ABI,
			functionName: 'balanceOf',
			args: [owner]
		});
	} catch (err) {
		throw wrap(err);
	}
}

/** USDC the escrow contract may pull from `address` (defaults to the connected wallet). */
export async function getAllowance(address?: Address): Promise<bigint> {
	try {
		const owner = address ?? (await getAddress());
		return await getPublicClient().readContract({
			address: config.usdcAddress,
			abi: ERC20_ABI,
			functionName: 'allowance',
			args: [owner, config.escrowAddress]
		});
	} catch (err) {
		throw wrap(err);
	}
}

export interface EscrowGame {
	player1: Address;
	player2: Address;
	stake: bigint;
	totalDeposits: bigint;
	status: EscrowChainStatus;
	createdAt: bigint;
	activatedAt: bigint;
}

/** The escrow contract's record for a game. `status` 0 (None) means unknown. */
export async function readEscrowGame(contractGameId: Hex): Promise<EscrowGame> {
	try {
		const game = await getPublicClient().readContract({
			address: config.escrowAddress,
			abi: GAME_ESCROW_ABI,
			functionName: 'getGame',
			args: [contractGameId]
		});
		return {
			player1: game.player1,
			player2: game.player2,
			stake: game.stake,
			totalDeposits: game.totalDeposits,
			status: game.status as EscrowChainStatus,
			createdAt: game.createdAt,
			activatedAt: game.activatedAt
		};
	} catch (err) {
		throw wrap(err);
	}
}

/** Alias matching the name used in the design doc. */
export const getEscrowGame = readEscrowGame;

export function isSameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
	return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

// ============================================================================
// Writes
// ============================================================================

/**
 * Wait for a transaction and require that it succeeded.
 * Throws a ChainError with a readable message on revert.
 */
export async function waitForTx(hash: Hash): Promise<TransactionReceipt> {
	let receipt: TransactionReceipt;
	try {
		receipt = await getPublicClient().waitForTransactionReceipt({
			hash,
			timeout: 120_000,
			pollingInterval: chain.id === 31337 ? 500 : 2_000
		});
	} catch (err) {
		throw wrap(err);
	}
	if (receipt.status !== 'success') {
		const link = txUrl(hash);
		throw new ChainError(
			`Transaction ${hash.slice(0, 10)}… reverted on chain${link ? ` (${link})` : ''}.`
		);
	}
	return receipt;
}

/**
 * Approve the escrow contract for exactly `units` when the current allowance
 * is below it. Returns the approval hash, or null when nothing was needed.
 * Never grants an unlimited allowance.
 */
export async function ensureAllowance(units: bigint): Promise<Hash | null> {
	const owner = await getAddress();
	const current = await getAllowance(owner);
	if (current >= units) return null;

	await switchToConfiguredChain();
	try {
		const client = await getWalletClient();
		const hash = await client.writeContract({
			address: config.usdcAddress,
			abi: ERC20_ABI,
			functionName: 'approve',
			args: [config.escrowAddress, units],
			account: client.account!,
			chain
		});
		await waitForTx(hash);
		return hash;
	} catch (err) {
		throw wrap(err);
	}
}

/** Submit `createGame(serverGameId, stakeUnits)`; resolves with the tx hash. */
export async function createGameOnChain(serverGameId: string, stakeUnits: bigint): Promise<Hash> {
	if (stakeUnits <= 0n) throw new ChainError('Stake must be greater than zero.');
	await switchToConfiguredChain();
	try {
		const client = await getWalletClient();
		return await client.writeContract({
			address: config.escrowAddress,
			abi: GAME_ESCROW_ABI,
			functionName: 'createGame',
			args: [serverGameId, stakeUnits],
			account: client.account!,
			chain
		});
	} catch (err) {
		throw wrap(err);
	}
}

/** Submit `joinGame(contractGameId)`; resolves with the tx hash. */
export async function joinGameOnChain(contractGameId: Hex): Promise<Hash> {
	await switchToConfiguredChain();
	try {
		const client = await getWalletClient();
		return await client.writeContract({
			address: config.escrowAddress,
			abi: GAME_ESCROW_ABI,
			functionName: 'joinGame',
			args: [contractGameId],
			account: client.account!,
			chain
		});
	} catch (err) {
		throw wrap(err);
	}
}

/** Submit `withdrawUnjoined(contractGameId)` (player 1, status Created only). */
export async function withdrawUnjoinedOnChain(contractGameId: Hex): Promise<Hash> {
	await switchToConfiguredChain();
	try {
		const client = await getWalletClient();
		return await client.writeContract({
			address: config.escrowAddress,
			abi: GAME_ESCROW_ABI,
			functionName: 'withdrawUnjoined',
			args: [contractGameId],
			account: client.account!,
			chain
		});
	} catch (err) {
		throw wrap(err);
	}
}

// ============================================================================
// Flows (approve → write → confirm), reported step by step for Seal UIs
// ============================================================================

export type SealState = 'pending' | 'stamping' | 'sealed' | 'released' | 'failed';

export type EscrowStep = 'approve' | 'create' | 'join';

export interface StepReport {
	step: EscrowStep;
	state: SealState;
	/** Short human text for the seal's detail line */
	detail?: string;
	txHash?: Hash;
}

export type StepReporter = (report: StepReport) => void;

export interface FundResult {
	/** Hash of the createGame tx, or null when the chain already held the game */
	txHash: Hash | null;
	/** True when the escrow was already Created by this wallet (nothing sent) */
	alreadyFunded: boolean;
}

/**
 * Player 1 funding: approve (if needed) → createGame → wait for receipt.
 *
 * Idempotent: if the escrow already shows this game as Created by the
 * connected wallet (a previous attempt mined but the server was never told),
 * nothing is sent and the caller can go straight to confirm-funding.
 */
export async function fundGameEscrow(
	params: { serverGameId: string; contractGameId: Hex; stakeUnits: bigint },
	report: StepReporter = () => {}
): Promise<FundResult> {
	const me = await getAddress();

	const existing = await readEscrowGame(params.contractGameId);
	if (existing.status === ESCROW_STATUS.Created && isSameAddress(existing.player1, me)) {
		report({ step: 'approve', state: 'sealed', detail: 'Already approved' });
		report({ step: 'create', state: 'sealed', detail: 'Escrow already funded' });
		return { txHash: null, alreadyFunded: true };
	}
	if (existing.status !== ESCROW_STATUS.None) {
		throw new ChainError(
			`This game already exists on chain with status ${describeChainStatus(existing.status)}.`
		);
	}

	const balance = await getUsdcBalance(me);
	if (balance < params.stakeUnits) {
		throw new ChainError(
			`Not enough USDC: you have ${unitsToUsdc(balance)} and the stake is ${unitsToUsdc(params.stakeUnits)}.`
		);
	}

	report({ step: 'approve', state: 'pending', detail: 'Approve USDC in your wallet' });
	try {
		const approveHash = await ensureAllowance(params.stakeUnits);
		report({
			step: 'approve',
			state: 'sealed',
			detail: approveHash ? 'USDC approved' : 'Allowance already sufficient',
			txHash: approveHash ?? undefined
		});
	} catch (err) {
		report({ step: 'approve', state: 'failed', detail: toChainErrorMessage(err) });
		throw wrap(err);
	}

	report({ step: 'create', state: 'pending', detail: 'Sign the createGame transaction' });
	let hash: Hash;
	try {
		hash = await createGameOnChain(params.serverGameId, params.stakeUnits);
		report({ step: 'create', state: 'stamping', detail: 'Waiting for confirmation', txHash: hash });
		await waitForTx(hash);
		report({ step: 'create', state: 'sealed', detail: 'Stake locked in escrow', txHash: hash });
	} catch (err) {
		report({ step: 'create', state: 'failed', detail: toChainErrorMessage(err) });
		throw wrap(err);
	}

	return { txHash: hash, alreadyFunded: false };
}

export interface JoinResult {
	txHash: Hash | null;
	alreadyJoined: boolean;
}

/**
 * Player 2 funding: approve (if needed) → joinGame → wait for receipt.
 *
 * Idempotent: if the escrow already shows the connected wallet as player 2,
 * nothing is sent and the caller can go straight to the server join.
 */
export async function joinGameEscrow(
	params: { contractGameId: Hex; stakeUnits: bigint },
	report: StepReporter = () => {}
): Promise<JoinResult> {
	const me = await getAddress();

	const existing = await readEscrowGame(params.contractGameId);
	if (existing.status === ESCROW_STATUS.Active && isSameAddress(existing.player2, me)) {
		report({ step: 'approve', state: 'sealed', detail: 'Already approved' });
		report({ step: 'join', state: 'sealed', detail: 'Stake already in escrow' });
		return { txHash: null, alreadyJoined: true };
	}
	if (existing.status !== ESCROW_STATUS.Created) {
		throw new ChainError(
			existing.status === ESCROW_STATUS.None
				? 'This game is not funded on chain yet.'
				: `This game can no longer be joined (status ${describeChainStatus(existing.status)}).`
		);
	}
	if (isSameAddress(existing.player1, me)) {
		throw new ChainError('You cannot join your own game.');
	}
	if (existing.stake !== params.stakeUnits) {
		throw new ChainError(
			`Stake mismatch: the chain holds ${unitsToUsdc(existing.stake)} USDC but the server says ${unitsToUsdc(params.stakeUnits)}.`
		);
	}

	const balance = await getUsdcBalance(me);
	if (balance < params.stakeUnits) {
		throw new ChainError(
			`Not enough USDC: you have ${unitsToUsdc(balance)} and the stake is ${unitsToUsdc(params.stakeUnits)}.`
		);
	}

	report({ step: 'approve', state: 'pending', detail: 'Approve USDC in your wallet' });
	try {
		const approveHash = await ensureAllowance(params.stakeUnits);
		report({
			step: 'approve',
			state: 'sealed',
			detail: approveHash ? 'USDC approved' : 'Allowance already sufficient',
			txHash: approveHash ?? undefined
		});
	} catch (err) {
		report({ step: 'approve', state: 'failed', detail: toChainErrorMessage(err) });
		throw wrap(err);
	}

	report({ step: 'join', state: 'pending', detail: 'Sign the joinGame transaction' });
	let hash: Hash;
	try {
		hash = await joinGameOnChain(params.contractGameId);
		report({ step: 'join', state: 'stamping', detail: 'Waiting for confirmation', txHash: hash });
		await waitForTx(hash);
		report({ step: 'join', state: 'sealed', detail: 'Stake locked in escrow', txHash: hash });
	} catch (err) {
		report({ step: 'join', state: 'failed', detail: toChainErrorMessage(err) });
		throw wrap(err);
	}

	return { txHash: hash, alreadyJoined: false };
}

export function describeChainStatus(status: EscrowChainStatus | number): string {
	const entry = Object.entries(ESCROW_STATUS).find(([, value]) => value === status);
	return entry ? entry[0] : `#${status}`;
}

/** Format base units for display, e.g. "1.5 USDC". */
export function formatUsdc(units: bigint | null | undefined): string {
	if (units === null || units === undefined) return '—';
	return `${unitsToUsdc(units)} USDC`;
}
