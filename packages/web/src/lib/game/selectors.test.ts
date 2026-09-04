import { describe, expect, test } from 'bun:test';
import { HIDDEN_MOVE, type GameStateView } from '@civil-sarabande/shared';
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
	getChosenColumns,
	getTheirKnownColumns,
	getTheirRevealedColumn,
	isHidden
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
		theirRevealedColumn: null,
		yourRole: 'player1',
		phaseDeadline: null,
		yourTurn: false,
		roundResult: null,
		escrow: {
			status: 'active',
			contractGameId: '0x00',
			stakeUnits: '0',
			payoutTxHash: null,
			yourPayout: null,
			theirPayout: null,
			error: null
		},
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

	test('theirScore is null while a needed opponent column is hidden', () => {
		// Opponent's column is masked; you assigned them row 0. Your score is unaffected.
		const game = makeGame({
			yourRole: 'player1',
			yourMoves: [2, 0],
			theirMoves: [HIDDEN_MOVE, 1]
		});
		const scores = calculateScores(game);
		expect(scores.yourScore).toBe(4 * 10 + 2);
		expect(scores.theirScore).toBeNull();
	});

	test('theirScore is null when a later column is hidden even if earlier ones are known', () => {
		const game = makeGame({
			yourRole: 'player1',
			yourMoves: [2, 0, 4, 1],
			theirMoves: [3, 1, HIDDEN_MOVE, 2]
		});
		expect(calculateScores(game).theirScore).toBeNull();
	});

	test('a hidden column that is not yet scored does not null the score', () => {
		// Their second column is hidden but you have not assigned a second row yet.
		const game = makeGame({
			yourRole: 'player1',
			yourMoves: [2, 0],
			theirMoves: [3, 1, HIDDEN_MOVE]
		});
		expect(calculateScores(game).theirScore).toBe(0 * 10 + 2);
	});

	test('scores resolve once the round ends and columns are revealed', () => {
		const game = makeGame({
			yourRole: 'player1',
			phase: 'roundEnd',
			yourMoves: [2, 0],
			theirMoves: [3, 1]
		});
		expect(calculateScores(game).theirScore).toBe(0 * 10 + 2);
	});
});

describe('hidden information', () => {
	test('isHidden recognises the sentinel only', () => {
		expect(isHidden(HIDDEN_MOVE)).toBe(true);
		expect(isHidden(0)).toBe(false);
		expect(isHidden(undefined)).toBe(false);
		expect(isHidden(null)).toBe(false);
	});

	test('assigned rows stay public when columns are masked', () => {
		const game = makeGame({ theirMoves: [HIDDEN_MOVE, 1, HIDDEN_MOVE, 2, HIDDEN_MOVE, 4] });
		expect(getAssignedRows(game)).toEqual([1, 2, 4]);
		expect(getTheirKnownColumns(game)).toEqual([]);
	});

	test('getTheirKnownColumns drops hidden entries', () => {
		const game = makeGame({ theirMoves: [3, 1, HIDDEN_MOVE, 2, 0, 4] });
		expect(getTheirKnownColumns(game)).toEqual([3, 0]);
	});

	test('getTheirRevealedColumn is null until both have revealed', () => {
		expect(getTheirRevealedColumn(makeGame({ theirMoves: [3, 1, 5, 2, 0, 4] }))).toBeNull();
		expect(
			getTheirRevealedColumn(makeGame({ theirMoves: [3, 1, 5, 2, 0, 4, HIDDEN_MOVE] }))
		).toBeNull();
	});

	test('getTheirRevealedColumn maps the revealed column into board orientation', () => {
		// Player 1 viewer: the opponent (P2) stores mirrored columns.
		expect(getTheirRevealedColumn(makeGame({ yourRole: 'player1', theirRevealedColumn: 3 }))).toBe(2);
		// Player 2 viewer: the opponent (P1) stores direct columns.
		expect(getTheirRevealedColumn(makeGame({ yourRole: 'player2', theirRevealedColumn: 3 }))).toBe(3);
		// Falls back to move 6 when the server field is null.
		expect(
			getTheirRevealedColumn(makeGame({ yourRole: 'player1', theirMoves: [3, 1, 5, 2, 0, 4, 5] }))
		).toBe(0);
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

	test('never treats a hidden opponent column as a column', () => {
		const hidden = makeGame({ yourMoves: [2, 0], theirMoves: [HIDDEN_MOVE, 1] });
		// Row 1 is theirs; no column of theirs is highlighted, and nothing odd
		// happens for the sentinel index.
		expect(getCellClasses(hidden, 1, 0)).toBe('their-row');
		expect(getCellClasses(hidden, 0, 5)).toBe('');
		expect(getCellClasses(hidden, 1, 2)).toBe('scored');
	});
});
