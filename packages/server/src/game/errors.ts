/**
 * Errors raised by the game engine and store.
 *
 * Every error carries the HTTP status the API should answer with, so the
 * route layer can map engine failures without string matching.
 */

export class GameError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GameError";
    this.status = status;
  }
}

/** The caller is not a member of the game (or not the member allowed to act). */
export class ForbiddenError extends GameError {
  constructor(message = "Player not in this game") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends GameError {
  constructor(message = "Game not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

/** The request was well-formed but the server could not complete it (chain down, etc.). */
export class UnavailableError extends GameError {
  constructor(message: string) {
    super(message, 503);
    this.name = "UnavailableError";
  }
}

export function statusForError(err: unknown, fallback = 400): number {
  return err instanceof GameError ? err.status : fallback;
}
