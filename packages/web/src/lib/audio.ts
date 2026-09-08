/**
 * Synthesized audio cues (WebAudio, no files).
 *
 * The AudioContext is created lazily on the first user gesture — never before
 * — so nothing ever autoplays. Cues fired outside a gesture (a round-end
 * stinger, a settlement thud) only sound if a gesture has already unlocked
 * audio on this page; otherwise they are silently skipped.
 *
 * `muted` is a store persisted to localStorage. `installAudioUnlock()` is
 * called once from the root layout to arm the gesture listener.
 */
import { writable, get } from 'svelte/store';

export type Cue = 'tick' | 'commit' | 'coin' | 'reveal' | 'win' | 'lose' | 'seal';

const STORAGE_KEY = 'civil-sarabande-muted';

function readMuted(): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

export const muted = writable<boolean>(readMuted());

muted.subscribe((value) => {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
	} catch {
		/* storage unavailable */
	}
});

export function toggleMuted(): void {
	muted.update((m) => !m);
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function getContext(): AudioContext | null {
	return ctx;
}

/** Create (or resume) the context. Only ever called from a user gesture. */
export function unlockAudio(): void {
	if (typeof window === 'undefined') return;
	const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return;
	if (!ctx) {
		ctx = new Ctor();
		master = ctx.createGain();
		master.gain.value = 0.22;
		master.connect(ctx.destination);
	}
	if (ctx.state === 'suspended') void ctx.resume();
}

let installed = false;
/** Arm a one-time gesture listener that unlocks audio. Safe to call twice. */
export function installAudioUnlock(): () => void {
	if (typeof window === 'undefined' || installed) return () => {};
	installed = true;
	const handler = () => {
		unlockAudio();
		window.removeEventListener('pointerdown', handler);
		window.removeEventListener('keydown', handler);
		installed = false;
	};
	window.addEventListener('pointerdown', handler, { passive: true });
	window.addEventListener('keydown', handler);
	return () => {
		window.removeEventListener('pointerdown', handler);
		window.removeEventListener('keydown', handler);
		installed = false;
	};
}

type Wave = OscillatorType;

interface Note {
	freq: number;
	at: number; // seconds from start
	dur: number;
	wave?: Wave;
	gain?: number;
	slideTo?: number;
}

function voice(c: AudioContext, out: AudioNode, n: Note, t0: number) {
	const osc = c.createOscillator();
	const g = c.createGain();
	osc.type = n.wave ?? 'sine';
	const start = t0 + n.at;
	osc.frequency.setValueAtTime(n.freq, start);
	if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, start + n.dur);
	const peak = n.gain ?? 0.6;
	g.gain.setValueAtTime(0.0001, start);
	g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
	g.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
	osc.connect(g).connect(out);
	osc.start(start);
	osc.stop(start + n.dur + 0.02);
}

function noiseBurst(c: AudioContext, out: AudioNode, t0: number, dur: number, gain: number, cutoff: number) {
	const len = Math.max(1, Math.floor(c.sampleRate * dur));
	const buf = c.createBuffer(1, len, c.sampleRate);
	const data = buf.getChannelData(0);
	for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
	const src = c.createBufferSource();
	src.buffer = buf;
	const filter = c.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.value = cutoff;
	const g = c.createGain();
	g.gain.setValueAtTime(gain, t0);
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
	src.connect(filter).connect(g).connect(out);
	src.start(t0);
}

const CUES: Record<Cue, (c: AudioContext, out: AudioNode, t: number) => void> = {
	tick: (c, out, t) => voice(c, out, { freq: 1400, at: 0, dur: 0.035, wave: 'square', gain: 0.25 }, t),
	commit: (c, out, t) => {
		voice(c, out, { freq: 440, at: 0, dur: 0.09, wave: 'triangle', gain: 0.5 }, t);
		voice(c, out, { freq: 660, at: 0.07, dur: 0.14, wave: 'triangle', gain: 0.5 }, t);
	},
	coin: (c, out, t) => {
		voice(c, out, { freq: 1760, at: 0, dur: 0.12, wave: 'triangle', gain: 0.45 }, t);
		voice(c, out, { freq: 2637, at: 0.04, dur: 0.18, wave: 'sine', gain: 0.35 }, t);
	},
	reveal: (c, out, t) => {
		voice(c, out, { freq: 220, at: 0, dur: 0.7, wave: 'sawtooth', gain: 0.18, slideTo: 880 }, t);
		voice(c, out, { freq: 330, at: 0.1, dur: 0.6, wave: 'sine', gain: 0.3, slideTo: 1320 }, t);
		noiseBurst(c, out, t + 0.45, 0.3, 0.12, 2400);
	},
	win: (c, out, t) => {
		[523, 659, 784, 1046].forEach((f, i) =>
			voice(c, out, { freq: f, at: i * 0.09, dur: i === 3 ? 0.5 : 0.16, wave: 'square', gain: 0.22 }, t)
		);
		voice(c, out, { freq: 1568, at: 0.36, dur: 0.5, wave: 'sine', gain: 0.18 }, t);
	},
	lose: (c, out, t) => {
		[392, 330, 262].forEach((f, i) =>
			voice(c, out, { freq: f, at: i * 0.18, dur: i === 2 ? 0.6 : 0.24, wave: 'triangle', gain: 0.4 }, t)
		);
	},
	seal: (c, out, t) => {
		voice(c, out, { freq: 90, at: 0, dur: 0.28, wave: 'sine', gain: 0.9, slideTo: 40 }, t);
		noiseBurst(c, out, t, 0.12, 0.35, 900);
	}
};

/** Play a cue. Silent when muted or before the first gesture. */
export function play(cue: Cue): void {
	if (get(muted)) return;
	const c = getContext();
	if (!c || !master || c.state !== 'running') return;
	try {
		CUES[cue](c, master, c.currentTime);
	} catch {
		/* audio is best-effort */
	}
}
