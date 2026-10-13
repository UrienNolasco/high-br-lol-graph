import { DeliveryGate } from './delivery-gate';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('DeliveryGate', () => {
  it('bounds concurrent deliveries and releases a slot after failure', async () => {
    const gate = new DeliveryGate(2);
    const first = deferred();
    const second = deferred();
    const third = jest.fn().mockResolvedValue('third');
    const a = gate.run(() => first.promise);
    const b = gate.run(async () => {
      await second.promise;
      throw new Error('failed');
    });
    const rejected = expect(b).rejects.toThrow('failed');
    const c = gate.run(third);
    expect(third).not.toHaveBeenCalled();
    second.resolve();
    await rejected;
    expect(await c).toBe('third');
    first.resolve();
    await a;
    await gate.close();
  });

  it('drains accepted work in order and refuses new deliveries during shutdown', async () => {
    const gate = new DeliveryGate(1);
    const first = deferred();
    const second = deferred();
    const order: number[] = [];
    const a = gate.run(() => first.promise);
    const b = gate.run(async () => {
      order.push(2);
      await second.promise;
    });
    const c = gate.run(() => {
      order.push(3);
      return Promise.resolve();
    });
    let closed = false;
    const drain = gate.close().then(() => {
      closed = true;
    });
    await expect(gate.run(() => Promise.resolve())).rejects.toThrow('draining');
    expect(closed).toBe(false);
    first.resolve();
    await a;
    expect(order).toEqual([2]);
    expect(closed).toBe(false);
    second.resolve();
    await Promise.all([b, c, drain]);
    expect(order).toEqual([2, 3]);
    expect(closed).toBe(true);
    await gate.close();
  });
});
