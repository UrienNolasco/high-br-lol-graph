import { of } from 'rxjs';
import { RiotService } from './riot.service';

describe('Riot discovery account observations', () => {
  it('keeps fresh league tier/rank and PUUID together without assuming match rank', async () => {
    const http = {
      get: jest.fn((url: string) =>
        of({
          data: {
            tier: url.includes('challenger')
              ? 'CHALLENGER'
              : url.includes('grandmaster')
                ? 'GRANDMASTER'
                : 'MASTER',
            queue: 'RANKED_SOLO_5x5',
            entries: [
              {
                puuid: url.includes('masterleagues') ? 'other' : 'same',
                rank: 'I',
                leaguePoints: 0,
              },
            ],
          },
        }),
      ),
    };
    const riot = new RiotService(
      http as any,
      { get: () => 'test' } as any,
      { throttle: jest.fn() } as any,
      { executeWithRetry: (fn: () => unknown) => fn() } as any,
      { setContext: jest.fn(), info: jest.fn() } as any,
    );
    const accounts = await riot.getHighEloAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toMatchObject({
      puuid: 'same',
      rank: {
        tier: 'CHALLENGER',
        division: 'I',
        leaguePoints: 0,
        queue: 'RANKED_SOLO_5x5',
        observedAt: expect.any(Date),
      },
    });
    expect(http.get).toHaveBeenCalledTimes(3);
  });
});
