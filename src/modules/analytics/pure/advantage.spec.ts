import { analyzeAdvantage, advantageIntegral } from './advantage';
import type { AdvantageMatch } from '../../matches/ports/advantage-reader';
import type { ParticipantSnapshot } from '../../matches/contracts/normalized-snapshots';
const fixture = (id = 'a'): AdvantageMatch => ({
  matchId: id,
  processing: { status: 'COMPLETED', processingVersion: 4 },
  populationEligible: true,
  durationMs: 1500000,
  participants: [100, 200].flatMap((teamId) =>
    ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].map((role, i) => ({
      puuid: `${teamId}:${i}`,
      championId: teamId + i,
      role,
      teamId,
      win: teamId === 100,
    })),
  ),
  projection: {
    projectionVersion: 1,
    frameIntervalMs: 60000,
    observedEndMs: 1500000,
    frames: Array.from({ length: 26 }, (_, i) => ({
      timestamp: i * 60000,
      frameIndex: i,
      participantFrames: Object.fromEntries(
        [100, 200].map((team) => [
          String(team),
          {
            puuid: `${team}:0`,
            totalGold: team === 100 ? 10000 + (i - 12) * 200 : 10000,
          } as ParticipantSnapshot,
        ]),
      ),
    })),
  },
  structures: [
    {
      metricVersion: 1,
      processingVersion: 4,
      timestampMs: 700000,
      beneficiaryTeamId: 100,
      frameIndex: 12,
      eventIndex: 0,
    },
  ],
});
const run = (matches: AdvantageMatch[]) =>
  analyzeAdvantage(
    { matches, availableMatches: matches.length, truncated: false },
    100,
    'TOP',
  );
describe('advantage conversion and recovery', () => {
  it('uses actual irregular timestamps and signed gold-minute trapezoids', () => {
    expect(
      advantageIntegral([
        { timestamp: 0, gold: -1000 },
        { timestamp: 30000, gold: 1000 },
        { timestamp: 90000, gold: 2000 },
      ]),
    ).toBe(1500);
    expect(
      advantageIntegral([
        { timestamp: 0, gold: 1000 },
        { timestamp: 120000, gold: 2000 },
      ]),
    ).toBeNull();
    expect(
      advantageIntegral([
        { timestamp: 0, gold: null },
        { timestamp: 60000, gold: 0 },
      ]),
    ).toBeNull();
  });
  it('deduplicates matches and structures and reports conditional denominators and uncertainty', () => {
    const a = fixture();
    a.structures.push(a.structures[0]);
    const result = run([a, a, fixture('b')]);
    const row = result.evidence[0];
    expect(row).toMatchObject({
      checkpointMs: 600000,
      goldLead: -400,
      bin: 'neutral',
      future: { goldLead: 600, leadChange: 1000, structures: 1 },
      integral: { value: 500 },
    });
    const c = result.cells.find(
      (c) => c.checkpointMs === 600000 && c.bin === 'neutral',
    )!;
    expect(c.outcome).toMatchObject({
      n: 2,
      wins: 2,
      rate: 1,
      reason: 'insufficient_sample',
    });
    expect(c.outcome.interval95![0]).toBeLessThan(1);
    expect(c.leadChange).toMatchObject({ n: 2, mean: 1000 });
    expect(result.coverage.exclusions.duplicate_match).toBe(1);
  });
  it('never includes missing checkpoints in outcome denominators or selects future frames', () => {
    const a = fixture();
    a.projection!.frames = a.projection!.frames.filter(
      (f) => f.timestamp !== 600000 && f.timestamp !== 540000,
    );
    expect(
      run([a])
        .cells.filter((c) => c.checkpointMs === 600000)
        .every((c) => c.outcome.n === 0),
    ).toBe(true);
    const b = fixture('b');
    b.projection!.frames[10].participantFrames['100'].totalGold = null;
    expect(run([b]).coverage.exclusions.missing_gold).toBe(1);
    const c = fixture('c');
    c.durationMs = 500000;
    expect(run([c]).evidence).toEqual([]);
  });
  it('keeps valid outcome checkpoints when later horizon is censored and never extrapolates integral', () => {
    const a = fixture();
    a.durationMs = 1000000;
    const r = run([a]);
    const cell = r.cells.find(
      (c) => c.checkpointMs === 900000 && c.bin === 'lead',
    )!;
    expect(cell.outcome.n).toBe(1);
    expect(cell.futureN).toBe(0);
    expect(cell.integral.mean).toBeNull();
    const b = fixture('b');
    b.projection!.frames = b.projection!.frames.filter(
      (f) => f.timestamp !== 720000,
    );
    expect(run([b]).evidence[0].integral.value).toBeNull();
  });
  it('recovers deficits only in eligible later windows and records unknown structure attribution', () => {
    const a = fixture();
    a.projection!.frames[10].participantFrames['100'].totalGold = 9000;
    a.structures[0].beneficiaryTeamId = null;
    const r = run([a]);
    const c = r.cells.find(
      (c) => c.checkpointMs === 600000 && c.bin === 'deficit',
    )!;
    expect(c.recovery).toMatchObject({ n: 1, wins: 1, rate: 1 });
    expect(c.structures.n).toBe(0);
    expect(c.meanStructures).toBeNull();
  });
  it('rejects unknown population, ambiguous roles and conflicting duplicate timestamps', () => {
    const a = fixture();
    a.populationEligible = null;
    const b = fixture('b');
    b.participants[6].role = 'TOP';
    const c = fixture('c');
    c.projection!.frames.push(c.projection!.frames[10]);
    expect(run([a, b, c]).evidence).toEqual([]);
    expect(run([a, b, c]).coverage.exclusions).toEqual({
      population_ineligible_or_unknown: 1,
      opponent_or_role_ambiguous: 1,
      duplicate_timestamp: 1,
    });
  });
  it('rejects unsupported projection and processing and never treats incompatible structure generations as zero', () => {
    const a = fixture();
    a.projection = null;
    const b = fixture('b');
    b.processing = null;
    const c = fixture('c');
    c.structures[0].processingVersion = 99;
    expect(run([a, b]).coverage.exclusions).toEqual({
      missing_or_unsupported_projection: 1,
      incomplete_or_unsupported_processing: 1,
    });
    expect(run([c]).evidence[0].future!.structures).toBeNull();
    expect(run([c]).evidence[0].future!).toMatchObject({
      focalGoldGain: 1000,
      opponentGoldGain: 0,
    });
  });
});
