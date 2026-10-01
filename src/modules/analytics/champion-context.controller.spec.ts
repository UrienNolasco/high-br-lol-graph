import { BadRequestException } from '@nestjs/common';
import { ChampionContextController } from './champion-context.controller';
describe('champion context query contract', () => {
  const reader = {
    read: jest
      .fn()
      .mockResolvedValue({
        matches: [],
        availableMatches: 0,
        truncated: false,
      }),
  };
  const controller = new ChampionContextController(reader);
  it('requires exact patch and canonical context; rejects broad or unknown filters', async () => {
    for (const q of [
      { patch: 'ALL', championId: '1', role: 'TOP' },
      { patch: '16.2', championId: '1' },
      { patch: '16.2', championId: '1', role: 'TOP', limit: '10001' },
      { patch: '16.2', championId: '1', role: 'TOP', playerId: 'x' },
    ])
      await expect(controller.read(q)).rejects.toBeInstanceOf(
        BadRequestException,
      );
  });
  it('uses normalized exact patch, role, bounded snapshot and absence', async () => {
    const r = await controller.read({
      patch: '16.02',
      championId: '1',
      role: 'TOP',
      fromMs: '0',
      toMs: '10',
    });
    expect(reader.read).toHaveBeenLastCalledWith({
      patch: '16.2',
      queueId: 420,
      fromMs: 0,
      toMs: 10,
      limit: 1000,
    });
    expect(r.baseline.rate).toBeNull();
  });
});
