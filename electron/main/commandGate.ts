interface QueuedCommand {
  start: () => void;
}

export interface CommandGateSnapshot {
  active: number;
  queued: number;
  maxConcurrency: number;
  maxQueue: number;
}

export class BoundedCommandGate {
  private active = 0;
  private readonly queue: QueuedCommand[] = [];

  constructor(
    private readonly maxConcurrency: number,
    private readonly maxQueue: number,
    private readonly overloadMessage: string,
  ) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error('Command gate concurrency must be a positive integer.');
    }
    if (!Number.isInteger(maxQueue) || maxQueue < 0) {
      throw new Error('Command gate queue size must be a non-negative integer.');
    }
  }

  getSnapshot(): CommandGateSnapshot {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      maxQueue: this.maxQueue,
    };
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active += 1;
        void Promise.resolve()
          .then(task)
          .then(
            (value) => {
              this.release();
              resolve(value);
            },
            (error: unknown) => {
              this.release();
              reject(error instanceof Error ? error : new Error(String(error ?? 'Command failed.')));
            },
          );
      };

      if (this.active < this.maxConcurrency) {
        start();
        return;
      }
      if (this.queue.length >= this.maxQueue) {
        reject(new Error(this.overloadMessage));
        return;
      }
      this.queue.push({ start });
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    this.queue.shift()?.start();
  }
}
