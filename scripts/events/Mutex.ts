/**
 * Mutex implementation for serializing async operations.
 * Prevents race conditions by ensuring only one operation
 * can execute a critical section at a time.
 */
export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  /**
   * Acquire the mutex lock. Waits if already locked.
   */
  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  /**
   * Release the mutex lock. Next queued acquirer gets it.
   */
  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift()!;
      resolve();
    } else {
      this.locked = false;
    }
  }

  /**
   * Execute callback exclusively within mutex lock.
   * Automatically acquires and releases the lock.
   */
  async runExclusive<T>(callback: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await callback();
    } finally {
      this.release();
    }
  }
}

export default Mutex;
