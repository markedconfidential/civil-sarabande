import type { PrivyWindowBindings } from './types';

declare global {
	interface Window extends PrivyWindowBindings {}
}

export {};

