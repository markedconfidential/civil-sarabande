/**
 * Transaction queue.
 *
 * The server signs every write with a single wallet, so writes must be
 * serialised: each job submits its transaction and waits for the receipt
 * before the next job starts, which keeps the nonce stream strictly ordered.
 */

import { createLogger } from "../utils/logger";

const logger = createLogger("blockchain/txQueue");

type Job<T> = () => Promise<T>;

interface QueuedJob {
  label: string;
  run: () => Promise<void>;
}

export class TxQueue {
  private queue: QueuedJob[] = [];
  private running = false;

  /** Number of jobs waiting plus the one running. */
  get size(): number {
    return this.queue.length + (this.running ? 1 : 0);
  }

  /** Run `job` after every previously enqueued job has finished. */
  enqueue<T>(label: string, job: Job<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        label,
        run: async () => {
          try {
            resolve(await job());
          } catch (err) {
            reject(err);
          }
        },
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift()!;
        logger.debug("Running queued transaction", { label: next.label, pending: this.queue.length });
        await next.run();
      }
    } finally {
      this.running = false;
    }
  }
}

/** The queue shared by every server-wallet write. */
export const txQueue = new TxQueue();
