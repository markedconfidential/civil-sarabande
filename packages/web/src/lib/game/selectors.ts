/**
 * Pure selectors over a player's view of the game state.
 *
 * Everything here is a function of `GameStateView` so it can be unit-tested
 * without a component and reused by any future board/score renderer.
 *
 * Hidden information: the server masks the opponent's own column choices
 * (their moves at even indices 0, 2, 4) with `HIDDEN_MOVE` until the round
 * ends. Row assignments (odd indices) are always public. Every selector here
 * treats `HIDDEN_MOVE` as "unknown", never as a column.
 */
import { GAME_CONSTANTS, HIDDEN_MOVE, type GameStateView } from '@civil-sarabande/shared';
import { getMovePhaseNumber, isBettingPhase, isMovePhase } from './phases';

const BOARD_SIZE = GAME_CONSTANTS.BOARD_SIZE;

export interface Scores {
	yourScore: number;
	/** Null while any opponent column needed for the score is still hidden */
	theirScore: number | null;
}

/** A column/row pair the player is composing but has not yet submitted. */
export interface CellPreview {
	column: number;
	row: number;
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}

/** True when a move value is the server's "you may not see this yet" sentinel. */
export function isHidden(value: number | undefined | null): boolean {
	return value === HIDDEN_MOVE;
}

function isKnown(value: number | undefined): value is number {
	return isDefined(value) && !isHidden(value);
}

// ---------------------------------------------------------------------------
// Move-derived selectors
// ---------------------------------------------------------------------------

/** Columns you have chosen for yourself so far (moves 0, 2, 4). */
export function getChosenColumns(game: GameStateView): number[] {
	return [game.yourMoves[0], game.yourMoves[2], game.yourMoves[4]].filter(isKnown);
}

/** Rows the opponent has assigned to you so far (their moves 1, 3, 5). Always public. */
export function getAssignedRows(game: GameStateView): number[] {
	return [game.theirMoves[1], game.theirMoves[3], game.theirMoves[5]].filter(isKnown);
}

/**
 * The opponent's own column choices as far as you are allowed to see them.
 * Hidden entries are dropped, so the result may be shorter than the number
 * of moves they have actually made.
 */
export function getTheirKnownColumns(game: GameStateView): number[] {
	return [game.theirMoves[0], game.theirMoves[2], game.theirMoves[4]].filter(isKnown);
}

/** Rows you assigned to the opponent so far (your moves 1, 3, 5). */
export function getYourAssignedRows(game: GameStateView): number[] {
	return [game.yourMoves[1], game.yourMoves[3], game.yourMoves[5]].filter(isKnown);
}

/**
 * The column the opponent revealed for scoring, in the viewer's board
 * orientation (mirrored for the opposite role), or null until both players
 * have revealed. Prefers the server's `theirRevealedColumn`, falling back to
 * their seventh move when visible.
 */
export function getTheirRevealedColumn(game: GameStateView): number | null {
	let raw: number | null | undefined = game.theirRevealedColumn;
	if (raw === null || raw === undefined) {
		raw = game.theirMoves[6];
	}
	if (raw === null || raw === undefined || isHidden(raw)) return null;
	// Player 2's moves are stored from their flipped perspective, so a player-1
	// viewer mirrors the opponent's (P2) column; a player-2 viewer sees P1's
	// column directly. This matches calculateScores.
	return game.yourRole === 'player1' ? BOARD_SIZE - 1 - raw : raw;
}

/**
 * Current scores based on committed moves.
 *
 * Player 2's moves are stored from their flipped perspective, so one side of
 * each intersection must be mirrored before indexing into the board.
 *
 * `theirScore` is null when any opponent column that would be scored is
 * still hidden: partial sums would leak nothing but would mislead.
 */
export function calculateScores(game: GameStateView): Scores {
	const isPlayer1 = game.yourRole === 'player1';

	// Your score: your columns × rows the opponent assigned to you
	let yourScore = 0;
	const yourCols = getChosenColumns(game);
	const theirAssignedRows = getAssignedRows(game);

	const numScored = Math.min(yourCols.length, theirAssignedRows.length);
	for (let i = 0; i < numScored; i++) {
		let col = yourCols[i];
		let row = theirAssignedRows[i];

		if (isPlayer1) {
			// P1: your columns are direct, opponent's (P2) rows need mirroring
			row = BOARD_SIZE - 1 - row;
		} else {
			// P2: your columns need mirroring, opponent's (P1) rows are direct
			col = BOARD_SIZE - 1 - col;
		}

		yourScore += game.board[row * BOARD_SIZE + col];
	}

	// Their score: their columns × rows you assigned to them
	const theirColsRaw = [game.theirMoves[0], game.theirMoves[2], game.theirMoves[4]].filter(
		isDefined
	);
	const yourAssignedRows = getYourAssignedRows(game);

	const theirNumScored = Math.min(theirColsRaw.length, yourAssignedRows.length);
	let theirScore: number | null = 0;
	for (let i = 0; i < theirNumScored; i++) {
		const rawCol = theirColsRaw[i];
		if (isHidden(rawCol)) {
			theirScore = null;
			break;
		}
		let col = rawCol;
		let row = yourAssignedRows[i];

		if (isPlayer1) {
			// P1: opponent's (P2) columns need mirroring, your row assignments are direct
			col = BOARD_SIZE - 1 - col;
		} else {
			// P2: opponent's (P1) columns are direct, your row assignments need mirroring
			row = BOARD_SIZE - 1 - row;
		}

		theirScore += game.board[row * BOARD_SIZE + col];
	}

	return { yourScore, theirScore };
}

/** Coins you must add to match the opponent's pot. */
export function getAmountToCall(game: GameStateView): number {
	return Math.max(0, game.theirPotCoins - game.yourPotCoins);
}

// ---------------------------------------------------------------------------
// Action availability
// ---------------------------------------------------------------------------

export function canMakeMove(game: GameStateView): boolean {
	if (!isMovePhase(game.phase)) return false;
	const expectedMoves = getMovePhaseNumber(game.phase) * 2;
	return game.yourMoves.length < expectedMoves;
}

export function canMakeBet(game: GameStateView): boolean {
	if (!isBettingPhase(game.phase)) return false;
	return !game.yourBetMade || game.yourPotCoins < game.theirPotCoins;
}

export function canFold(game: GameStateView): boolean {
	if (!isBettingPhase(game.phase)) return false;
	return game.yourPotCoins < game.theirPotCoins;
}

export function canReveal(game: GameStateView): boolean {
	if (game.phase !== 'reveal') return false;
	return game.yourMoves.length < 7;
}

export function canEndRound(game: GameStateView): boolean {
	return game.phase === 'roundEnd' && !game.yourEndedRound;
}

export function canStartNextRound(game: GameStateView): boolean {
	return game.phase === 'roundEnd' && game.yourEndedRound && game.theirEndedRound;
}

// ---------------------------------------------------------------------------
// Board cell presentation
// ---------------------------------------------------------------------------

/**
 * CSS classes for a board cell given committed moves and an optional preview.
 *
 * Class names are the contract the stylesheet keys off of: `scored`,
 * `your-column`, `their-row`, `preview-intersection`, `preview-column`,
 * `preview-row`. Future art assets should hook into these, not replace them.
 * Hidden opponent columns never produce a class.
 */
export function getCellClasses(
	game: GameStateView,
	row: number,
	col: number,
	preview: CellPreview | null = null
): string {
	const classes: string[] = [];

	const isYourColumn = getChosenColumns(game).includes(col);
	const isTheirRow = getAssignedRows(game).includes(row);

	if (isYourColumn && isTheirRow) {
		classes.push('scored');
	} else {
		if (isYourColumn) classes.push('your-column');
		if (isTheirRow) classes.push('their-row');
	}

	if (preview) {
		if (col === preview.column && row === preview.row) {
			classes.push('preview-intersection');
		} else if (col === preview.column) {
			classes.push('preview-column');
		} else if (row === preview.row) {
			classes.push('preview-row');
		}
	}

	return classes.join(' ');
}
