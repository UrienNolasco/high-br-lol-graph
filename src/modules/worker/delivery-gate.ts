/** Also bounds executions across broker reconnections with old handlers in flight. */
export class DeliveryGate {
  private active = 0;
  private accepting = true;
  private readonly waiting: Array<() => void> = [];
  private readonly drained: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error('Invalid delivery limit');
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (!this.accepting) throw new Error('Worker is draining');
    if (this.active >= this.limit)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next)
        next(); // Transfer the occupied slot to an accepted delivery.
      else if (--this.active === 0)
        this.drained.splice(0).forEach((resolve) => resolve());
    }
  }

  async close(): Promise<void> {
    this.accepting = false;
    if (this.active)
      await new Promise<void>((resolve) => this.drained.push(resolve));
  }
}
