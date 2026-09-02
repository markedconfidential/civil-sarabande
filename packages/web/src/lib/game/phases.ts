/**
 * Pure helpers for reasoning about a game's phase.
 * No component state here — everything takes the phase as input.
 */
import type { GamePhase } from '@civil-sarabande/shared';

const PHASE_DISPLAY_NAMES: Record<GamePhase, string> = {
	waiting: 'Waiting for Opponent',
	move1: 'Move 1',
	bet1: 'Betting Round 1',
	move2: 'Move 2',
	bet2: 'Betting Round 2',
	move3: 'Move 3',
	bet3: 'Betting Round 3',
	reveal: 'Reveal',
	finalBet: 'Final Betting',
	roundEnd: 'Round Complete',
	ended: 'Game Over'
};

export function isMovePhase(phase: GamePhase): boolean {
	return phase === 'move1' || phase === 'move2' || phase === 'move3';
}

export function isBettingPhase(phase: GamePhase): boolean {
	return phase === 'bet1' || phase === 'bet2' || phase === 'bet3' || phase === 'finalBet';
}

/** 1, 2 or 3 for the move/bet phases of a round; 0 for every other phase. */
export function getMovePhaseNumber(phase: GamePhase): number {
	if (phase === 'move1' || phase === 'bet1') return 1;
	if (phase === 'move2' || phase === 'bet2') return 2;
	if (phase === 'move3' || phase === 'bet3') return 3;
	return 0;
}

export function getPhaseDisplayName(phase: GamePhase): string {
	return PHASE_DISPLAY_NAMES[phase] ?? phase;
}
