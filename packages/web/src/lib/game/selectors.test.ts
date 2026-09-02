import { describe, expect, test } from 'bun:test';
import type { GameStateView } from '@civil-sarabande/shared';
import {
	calculateScores,
	canEndRound,
	canFold,
	canMakeBet,
	canMakeMove,
	canReveal,
	canStartNextRound,
	getAmountToCall,
	getAssignedRows,
	getCellClasses,
	getChosenColumns
} from './selectors';

// A 6x6 board where cell (row, col) = row * 10 + col, so scores are easy to read.
const BOARD = Array.from({ length: 36 }, (_, i) => Math.floor(i / 6) * 10 + (i % 6));

function makeGame(overrides: Partial<GameStateView> = {}): GameStateView {
	return {
		gameId: 'g1',
		board: BOARD,
		phase: 'move1',
		player1: { id: 'p1', name: 'Alice' },
		player2: { id: 'p2', name: 'Bob' },
		roundNumber: 1,
		stake: 0,
		createdAt: 0,
		yourCoins: 100,
		theirCoins: 100,
		yourPotCoins: 0,
		theirPotCoins: 0,
		yourBetMade: false,
		theirBetMade: false,
		settledPotCoins: 0,
		yourEndedRound: false,
		theirEndedRound: false,
		yourMoves: [],
		theirMoves: [],
		yourRole: 'player1',
		...overrides
	};
}

describe('move-derived selectors', () => {
	test('chosen columns are moves 0, 2, 4', () => {
		const game = makeGame({ yourMoves: [3, 1, 5, 2, 0, 4] });
		expect(getChosenColumns(game)).toEqual([3, 5, 0]);
	});

	test('assigned rows are opponent moves 1, 3, 5', () => {
		const game = makeGame({ theirMoves: [3, 1, 5, 2, 0, 4] });
		expect(getAssignedRows(game)).toEqual([1, 2, 4]);
	});

	test('partial move lists are handled', () => {
		const game = makeGame({ yourMoves: [3, 1, 5], theirMoves: [2] });
		expect(getChosenColumns(game)).toEqual([3, 5]);
		expect(getAssignedRows(game)).toEqual([]);
	});
});

describe('calculateScores', () => {
	test('player1 mirrors the opponent rows and columns', () => {
		// You (P1) chose column 2; opponent assigned you row 1 (from their flipped view → row 4).
		// Opponent chose column 3 (flipped → col 2); you assigned them row 0.
		const game = makeGame({
			yourRole: 'player1',
			yourMoves: [2, 0],
			theirMoves: [3, 1]
		});
		const scores = calculateScores(game);
		expect(scores.yourScore).toBe(4 * 10 + 2);
		expect(scores.theirScore).toBe(0 * 10 + 2);
	});

	test('player2 mirrors its own columns and row assignments', () => {
		// You (P2) chose column 2 (flipped → col 3); opponent (P1) assigned you row 1 directly.
		// Opponent chose column 3 directly; you assigned them row 0 (flipped → row 5).
		const game = makeGame({
			yourRole: 'player2',
			yourMoves: [2, 0],
			theirMoves: [3, 1]
		});
		const scores = calculateScores(game);
		expect(scores.yourScore).toBe(1 * 10 + 3);
		expect(scores.theirScore).toBe(5 * 10 + 3);
	});

	test('only scores intersections both players have committed', () => {
		const game = makeGame({
			yourRole: 'player1',
			yourMoves: [2, 0, 4, 1],
			theirMoves: [3, 1]
		});
		const scores = calculateScores(game);
		// Only the first column/row pair counts on each side.
		expect(scores.yourScore).toBe(4 * 10 + 2);
		expect(scores.theirScore).toBe(0 * 10 + 2);
	});

	test('returns zero with no moves', () => {
		expect(calculateScores(makeGame())).toEqual({ yourScore: 0, theirScore: 0 });
	});
});

describe('action availability', () => {
	test('canMakeMove tracks expected move count for the phase', () => {
		expect(canMakeMove(makeGame({ phase: 'move1', yourMoves: [] }))).toBe(true);
		expect(canMakeMove(makeGame({ phase: 'move1', yourMoves: [0, 0] }))).toBe(false);
		expect(canMakeMove(makeGame({ phase: 'move2', yourMoves: [0, 0] }))).toBe(true);
		expect(canMakeMove(makeGame({ phase: 'move3', yourMoves: [0, 0, 0, 0, 0, 0] }))).toBe(false);
		expect(canMakeMove(makeGame({ phase: 'bet1', yourMoves: [] }))).toBe(false);
	});

	test('canMakeBet allows a first bet or a call when behind', () => {
		expect(canMakeBet(makeGame({ phase: 'bet1', yourBetMade: false }))).toBe(true);
		expect(
			canMakeBet(makeGame({ phase: 'bet1', yourBetMade: true, yourPotCoins: 5, theirPotCoins: 5 }))
		).toBe(false);
		expect(
			canMakeBet(makeGame({ phase: 'finalBet', yourBetMade: true, yourPotCoins: 5, theirPotCoins: 9 }))
		).toBe(true);
		expect(canMakeBet(makeGame({ phase: 'move1' }))).toBe(false);
	});

	test('canFold only when behind in a betting phase', () => {
		expect(canFold(makeGame({ phase: 'bet2', yourPotCoins: 1, theirPotCoins: 3 }))).toBe(true);
		expect(canFold(makeGame({ phase: 'bet2', yourPotCoins: 3, theirPotCoins: 3 }))).toBe(false);
		expect(canFold(makeGame({ phase: 'reveal', yourPotCoins: 1, theirPotCoins: 3 }))).toBe(false);
	});

	test('getAmountToCall never goes negative', () => {
		expect(getAmountToCall(makeGame({ yourPotCoins: 2, theirPotCoins: 7 }))).toBe(5);
		expect(getAmountToCall(makeGame({ yourPotCoins: 7, theirPotCoins: 2 }))).toBe(0);
	});

	test('canReveal until the seventh move is recorded', () => {
		expect(canReveal(makeGame({ phase: 'reveal', yourMoves: [0, 0, 0, 0, 0, 0] }))).toBe(true);
		expect(canReveal(makeGame({ phase: 'reveal', yourMoves: [0, 0, 0, 0, 0, 0, 0] }))).toBe(false);
		expect(canReveal(makeGame({ phase: 'move3', yourMoves: [] }))).toBe(false);
	});

	test('round end gating', () => {
		expect(canEndRound(makeGame({ phase: 'roundEnd', yourEndedRound: false }))).toBe(true);
		expect(canEndRound(makeGame({ phase: 'roundEnd', yourEndedRound: true }))).toBe(false);
		expect(
			canStartNextRound(makeGame({ phase: 'roundEnd', yourEndedRound: true, theirEndedRound: true }))
		).toBe(true);
		expect(
			canStartNextRound(makeGame({ phase: 'roundEnd', yourEndedRound: true, theirEndedRound: false }))
		).toBe(false);
	});
});

describe('getCellClasses', () => {
	const game = makeGame({ yourMoves: [2, 0], theirMoves: [3, 1] });

	test('marks your column, their row, and the scored intersection', () => {
		expect(getCellClasses(game, 0, 2)).toBe('your-column');
		expect(getCellClasses(game, 1, 0)).toBe('their-row');
		expect(getCellClasses(game, 1, 2)).toBe('scored');
		expect(getCellClasses(game, 0, 0)).toBe('');
	});

	test('layers preview classes on top when a move is being composed', () => {
		const preview = { column: 4, row: 5 };
		expect(getCellClasses(game, 5, 4, preview)).toBe('preview-intersection');
		expect(getCellClasses(game, 0, 4, preview)).toBe('preview-column');
		expect(getCellClasses(game, 5, 0, preview)).toBe('preview-row');
		expect(getCellClasses(game, 0, 2, preview)).toBe('your-column');
		expect(getCellClasses(game, 1, 2, { column: 2, row: 1 })).toBe('scored preview-intersection');
	});
});
