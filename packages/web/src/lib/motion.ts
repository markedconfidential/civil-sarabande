/**
 * Motion presets for phase and state transitions.
 *
 * Thin wrappers over Svelte's built-in transitions so every component uses the
 * same timing vocabulary, and so all motion collapses to zero duration when the
 * viewer has asked for reduced motion.
 */
import { fade, fly, scale, type TransitionConfig } from 'svelte/transition';
import { backOut, cubicOut } from 'svelte/easing';

const prefersReducedMotion =
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scale a duration (ms) to zero under reduced motion. */
export function ms(duration: number): number {
	return prefersReducedMotion ? 0 : duration;
}

interface MotionParams {
	delay?: number;
	duration?: number;
}

/** A panel or section arriving: short rise and fade. */
export function panelIn(node: Element, params: MotionParams = {}): TransitionConfig {
	return fly(node, {
		y: 12,
		duration: ms(params.duration ?? 220),
		delay: ms(params.delay ?? 0),
		easing: cubicOut
	});
}

/** Content swapping in place: a quick opacity change. */
export function quickFade(node: Element, params: MotionParams = {}): TransitionConfig {
	return fade(node, {
		duration: ms(params.duration ?? 150),
		delay: ms(params.delay ?? 0)
	});
}

/** A value or verdict landing: scale up with a slight overshoot. */
export function popIn(node: Element, params: MotionParams = {}): TransitionConfig {
	return scale(node, {
		start: 0.85,
		duration: ms(params.duration ?? 260),
		delay: ms(params.delay ?? 0),
		easing: backOut
	});
}
