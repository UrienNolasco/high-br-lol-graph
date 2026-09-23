import { episodeResources } from './episode-resources';
import { resourceFrame } from './kill-episodes.fixture';
const context = {
  matchId: 'm',
  episodeId: 'episode',
  processedAt: '2026-09-23T00:00:00Z',
  processingVersion: 3,
  startMs: 120000,
  maxAgeMs: 60000,
};
const projection = (frames: ReturnType<typeof resourceFrame>[]) => ({
  projectionVersion: 1,
  frames,
});
describe('strictly pre-episode snapshot resources', () => {
  it('selects a strictly earlier global frame and never reads equal-time or future resource values', () => {
    const frames = [
      resourceFrame(1, 60000, 10),
      resourceFrame(2, 120000, 999),
      resourceFrame(3, 180000, 9999),
    ];
    const result = episodeResources(projection(frames), ['a'], context);
    expect(result).toMatchObject({
      snapshotTimestampMs: 60000,
      ageMs: 60000,
      stale: false,
    });
    expect(result.participants[0].currentGold).toMatchObject({
      value: 10,
      origin: 'observed',
      window: { startMs: 60000, endMs: 60000 },
      evidence: [{ frameIndex: 1, timestampMs: 60000 }],
    });
    expect(result.participants[0].unspentGoldProxy.origin).toBe('estimated');
    frames[1].participantFrames['1'].currentGold = 1;
    frames[2].participantFrames['1'].currentGold = 2;
    expect(episodeResources(projection(frames), ['a'], context)).toEqual(
      result,
    );
  });
  it('preserves age for stale frames but marks resource unavailable, including start-of-game absence', () => {
    const r = episodeResources(
      projection([resourceFrame(1, 59999, 100)]),
      ['a'],
      context,
    );
    expect(r).toMatchObject({
      ageMs: 60001,
      stale: true,
      reason: 'missing_frame',
    });
    expect(r.participants[0].currentGold).toMatchObject({
      value: null,
      reason: 'missing_frame',
      evidence: [{ value: 100 }],
    });
    expect(
      episodeResources(projection([resourceFrame(0, 0)]), ['a'], {
        ...context,
        startMs: 0,
      }),
    ).toMatchObject({
      snapshotTimestampMs: null,
      ageMs: null,
      reason: 'missing_frame',
    });
  });
  it('does not backfill a missing participant from older frame; equal timestamp tie uses greater frame index', () => {
    const later = resourceFrame(2, 90000, 20);
    delete later.participantFrames['1'];
    const p = projection([resourceFrame(1, 60000, 10), later]);
    expect(
      episodeResources(p, ['a'], context).participants[0].currentGold.reason,
    ).toBe('missing_frame');
    expect(
      episodeResources(
        projection([resourceFrame(1, 60000, 10), resourceFrame(2, 60000, 20)]),
        ['a'],
        context,
      ).participants[0].currentGold.value,
    ).toBe(20);
  });
  it('distinguishes zero, missing fields, invalid numbers, zero ratio and unsupported/missing projection', () => {
    let p = projection([resourceFrame(1, 60000, 0, 0)]);
    expect(episodeResources(p, ['a'], context).participants[0]).toMatchObject({
      currentGold: { value: 0 },
      unspentShare: { value: null, reason: 'zero_denominator' },
    });
    (p.frames[0].participantFrames['1'] as any).currentGold = null;
    expect(
      episodeResources(p, ['a'], context).participants[0].currentGold.reason,
    ).toBe('missing_field');
    p.frames[0].participantFrames['1'].currentGold = -1;
    expect(
      episodeResources(p, ['a'], context).participants[0].currentGold.reason,
    ).toBe('invalid_value');
    expect(episodeResources(null, ['a'], context).reason).toBe(
      'missing_projection',
    );
    expect(
      episodeResources({ ...p, projectionVersion: 99 }, ['a'], context).reason,
    ).toBe('unsupported_version');
    expect(
      episodeResources(projection([p.frames[0], p.frames[0]]), ['a'], context)
        .reason,
    ).toBe('invalid_value');
  });
});
