import { ReadSnapshot } from './read-snapshot';
import { PrismaService } from './prisma.service';
it('preserves the repeatable transaction through nested async reads, isolates concurrent scopes and clears failures', async () => {
  const clients = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const transaction = jest.fn(async (fn, _options: unknown) =>
    fn(clients.shift()),
  );
  const snapshot = new ReadSnapshot({
    $transaction: transaction,
  } as unknown as PrismaService);
  expect(() => snapshot.client()).toThrow('scope required');
  let release!: () => void;
  const barrier = new Promise<void>((r) => (release = r));
  const first = snapshot.run(async () => {
    const a = snapshot.client();
    await barrier;
    return snapshot.run(async () => {
      expect(snapshot.client()).toBe(a);
      return a;
    });
  });
  const second = snapshot.run(async () => {
    const b = snapshot.client();
    release();
    return b;
  });
  const [a, b] = await Promise.all([first, second]);
  expect(a).not.toBe(b);
  expect(transaction).toHaveBeenCalledTimes(2);
  expect(transaction.mock.calls[0][1]).toEqual({
    isolationLevel: 'RepeatableRead',
    timeout: 30000,
  });
  await expect(
    snapshot.run(async () => {
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect(() => snapshot.client()).toThrow('scope required');
});
