import type {
  MatchReviewContext,
  ReviewParticipant,
} from '../../contracts/match-review';
import { calculateDeathRecapReview } from './death-recap-review';

const player = (
  puuid: string,
  teamId: number,
  championName: string,
): ReviewParticipant => ({
  puuid,
  teamId,
  championName,
  role: null,
  kills: 0,
  deaths: 1,
  assists: 0,
  finalStats: {},
});
const entry = (
  participantId = 1,
  name = 'Ahri',
  physicalDamage: unknown = 100,
  extra: Record<string, unknown> = {},
) => ({
  participantId,
  name,
  physicalDamage,
  magicDamage: 0,
  trueDamage: 0,
  type: 'OTHER',
  ...extra,
});
function context(rows: unknown = [entry()]): MatchReviewContext {
  return {
    input: {
      matchId: 'match',
      gameDuration: 900,
      gameVersion: '16.19',
      queueId: 420,
      mapId: 11,
      participants: [
        player('one', 100, 'Ahri'),
        player('two', 100, 'Nami'),
        player('three', 100, 'Jax'),
        player('victim', 200, 'Gwen'),
      ],
      projection: null,
      events: [],
      processing: null,
    },
    sourceReason: null,
    snapshotReason: 'missing_projection',
    combatReason: null,
    processedAt: '2026-10-13T23:00:00.000Z',
    processingVersion: 2,
    endMs: 900000,
    frames: [],
    participantIds: new Map([
      [1, 'one'],
      [2, 'two'],
      [3, 'three'],
      [6, 'victim'],
    ]),
    kills: [
      {
        eventId: 'match:2:3',
        timestampMs: 100000,
        frameIndex: 2,
        eventIndex: 3,
        killerPuuid: 'one',
        victimPuuid: 'victim',
        assistingPuuids: ['two'],
        assistanceComplete: true,
        payload: {
          killerId: 1,
          victimId: 6,
          assistingParticipantIds: [2],
          victimDamageReceived: rows,
        },
      },
    ],
  };
}
const calculate = (ctx: MatchReviewContext) =>
  calculateDeathRecapReview(ctx, 'victim');

describe('calculateDeathRecapReview', () => {
  it('groups sources, exposes additions beyond explicit assistance, and retains event provenance without frames', () => {
    const result = calculate(
      context([entry(), entry(1, 'Ahri', 50), entry(3, 'Jax', 20)]),
    );
    expect(result.available).toBe(true);
    expect(result.processedAt).toBe('2026-10-13T23:00:00.000Z');
    expect(result.coverage).toEqual({
      observedDeaths: 1,
      expectedDeaths: 1,
      recapsWithObservedList: 1,
      availableRecaps: 1,
    });
    const death = result.deaths[0];
    expect(death.sourceCount).toBe(2);
    expect(death.sources[0].damage.total).toBe(150);
    expect(death.additionalSourceIds).toEqual([3]);
    expect(death.baselineAbsentFromPositiveRecap).toEqual([2]);
    expect(death.championListedDamageDenominator).toBe(170);
    expect(death.largestSourceShare).toBeCloseTo(150 / 170);
    expect(death.windowDurationMs).toBeNull();
    expect(death.sourceMaxTimestampMs).toBe(100000);
    expect(death.entries[0].evidence[0]).toMatchObject({
      eventId: 'match:2:3',
      timestampMs: 100000,
      field: 'payload.victimDamageReceived[0].physicalDamage',
      value: 100,
    });
  });

  it('never remaps a conflicting champion name and marks consistent subsets as partial', () => {
    const death = calculate(context([entry(), entry(2, 'Jax', 50)])).deaths[0];
    expect(death.available).toBe(false);
    expect(death.quality.issues).toContain('id_name_conflict');
    expect(death.sourceCount).toBeNull();
    expect(death.sourcesComplete).toBe(false);
    expect(death.sources.map((source) => source.participantId)).toEqual([1]);
    expect(death.entries[1].sourcePuuid).toBeNull();
    expect(death.listedDamage.total).toBe(150);
    expect(death.nonParticipantUnitDamage.total).toBeNull();
  });

  it('separates corroborated non-participant units from ID0 OTHER without guessing ownership', () => {
    const death = calculate(
      context([
        entry(),
        entry(0, 'Tower', 20, { type: 'TOWER' }),
        entry(0, 'MonkeyKing', 8),
      ]),
    ).deaths[0];
    expect(death.available).toBe(false);
    expect(death.quality.issues).toContain('unattributed_zero_id');
    expect(death.partialNonParticipantUnitDamage.total).toBe(20);
    expect(death.partialUnattributedDamage.total).toBe(8);
    expect(death.nonParticipantUnitDamage.total).toBeNull();
    expect(death.additionalSourceIds).toBeNull();
    expect(death.entries[2].sourcePuuid).toBeNull();
  });

  it('preserves known components when another component is missing without declaring a complete total', () => {
    const raw = entry(1, 'Ahri', 30, { trueDamage: 5 });
    delete (raw as Record<string, unknown>).magicDamage;
    const death = calculate(
      context([
        raw,
        entry(0, 'Tower', undefined, { type: 'TOWER', physicalDamage: null }),
      ]),
    ).deaths[0];
    expect(death.listedDamage).toEqual({
      physical: null,
      magic: null,
      true: 5,
      total: null,
    });
    expect(death.partialListedDamage).toMatchObject({
      physical: 30,
      magic: 0,
      true: 5,
      total: 35,
      knownPhysicalComponents: 1,
      knownMagicComponents: 1,
      knownTrueComponents: 2,
    });
    expect(death.sources[0].damage.total).toBeNull();
    expect(death.sources[0].partialDamage.total).toBe(35);
    expect(death.nonParticipantUnitDamage.total).toBeNull();
    expect(death.sourceCount).toBeNull();
  });

  it.each([-1, NaN, Infinity, true, '4'])(
    'rejects nonnumeric or invalid damage %s',
    (invalid) => {
      const death = calculate(context([entry(1, 'Ahri', invalid)])).deaths[0];
      expect(death.available).toBe(false);
      expect(death.listedDamage.physical).toBeNull();
      expect(death.listedDamage.total).toBeNull();
    },
  );

  it('rejects overflow of otherwise finite entry components', () => {
    const death = calculate(
      context([
        entry(1, 'Ahri', Number.MAX_VALUE),
        entry(1, 'Ahri', Number.MAX_VALUE),
      ]),
    ).deaths[0];
    expect(death.available).toBe(false);
    expect(death.quality.issues).toContain('damage_sum_overflow');
    expect(death.listedDamage.total).toBeNull();
    expect(death.largestSourceShare).toBeNull();
  });

  it('distinguishes zero, an observed empty list, absent recap, and malformed list; no Teamfight fallback', () => {
    const zero = calculate(context([entry(1, 'Ahri', 0)])).deaths[0];
    expect(zero.available).toBe(true);
    expect(zero.sourceCount).toBe(0);
    expect(zero.largestSourceShare).toBeNull();
    const empty = calculate(context([])).deaths[0];
    expect(empty.listState).toBe('empty');
    expect(empty.listedDamage.total).toBe(0);
    expect(empty.sourceCount).toBeNull();
    const ctx = context();
    delete ctx.kills[0].payload.victimDamageReceived;
    ctx.kills[0].payload.victimTeamfightDamageReceived = [entry()];
    expect(calculate(ctx).deaths[0]).toMatchObject({
      listState: 'absent',
      listedDamage: { total: null },
    });
    expect(calculate(context({})).deaths[0]).toMatchObject({
      listState: 'invalid',
      listedDamage: { total: null },
    });
  });

  it('does not assume zero assists from omission, even when the context incorrectly claims complete', () => {
    const ctx = context();
    delete ctx.kills[0].payload.assistingParticipantIds;
    const death = calculate(ctx).deaths[0];
    expect(death.available).toBe(true);
    expect(death.baselineComparable).toBe(false);
    expect(death.additionalSourceIds).toBeNull();
    expect(death.baselineSourceIds).toBeNull();
  });

  it.each(
    [[2, 2], [true], [{}], [6], [1], [99]].map((assists) => ({ assists })),
  )('rejects malformed or inconsistent baseline %p', ({ assists }) => {
    const ctx = context();
    ctx.kills[0].payload.assistingParticipantIds = assists;
    expect(calculate(ctx).deaths[0].baselineComparable).toBe(false);
  });

  it('refuses malformed source IDs and same-team attribution while preserving literal damage', () => {
    for (const bad of [
      entry(6, 'Gwen'),
      entry(99, 'Unknown'),
      entry(1, 'Ahri', 10, { participantId: true }),
      null,
    ]) {
      const death = calculate(context([bad])).deaths[0];
      expect(death.available).toBe(false);
      expect(death.sourceCount).toBeNull();
      expect(death.sources).toEqual([]);
    }
  });

  it('requires the raw assistance list and normalized complete identities to agree', () => {
    const ctx = context();
    ctx.kills[0].assistingPuuids = ['three'];
    expect(calculate(ctx).deaths[0].baselineComparable).toBe(false);
    ctx.kills[0].assistingPuuids = ['two'];
    ctx.kills[0].assistanceComplete = false;
    expect(calculate(ctx).deaths[0].baselineComparable).toBe(false);
    ctx.kills[0].assistanceComplete = true;
    ctx.kills[0].payload.killerId = true;
    expect(calculate(ctx).deaths[0].baselineComparable).toBe(false);
  });

  it('does not attribute an environmental killer to a participant baseline', () => {
    const ctx = context([entry(0, 'Tower', 25, { type: 'TOWER' })]);
    ctx.kills[0].killerPuuid = null;
    ctx.kills[0].payload.killerId = 0;
    ctx.kills[0].assistingPuuids = [];
    ctx.kills[0].payload.assistingParticipantIds = [];
    const death = calculate(ctx).deaths[0];
    expect(death.available).toBe(true);
    expect(death.nonParticipantUnitDamage.total).toBe(25);
    expect(death.sourceCount).toBe(0);
    expect(death.championListedDamageDenominator).toBe(0);
    expect(death.largestSourceShare).toBeNull();
    expect(death.baselineSourceIds).toEqual([]);
    expect(death.additionalSourceIds).toEqual([]);
  });

  it('accepts explicitly empty assistance and keeps the killer-only baseline', () => {
    const ctx = context();
    ctx.kills[0].payload.assistingParticipantIds = [];
    ctx.kills[0].assistingPuuids = [];
    expect(calculate(ctx).deaths[0].baselineSourceIds).toEqual([1]);
  });

  it('preserves literal damage but refuses attribution when explicit participant identity is unavailable', () => {
    const ctx = context();
    ctx.participantIds.clear();
    const death = calculate(ctx).deaths[0];
    expect(death.listedDamage.total).toBe(100);
    expect(death.available).toBe(false);
    expect(death.sourceCount).toBeNull();
    expect(death.quality.issues).toContain('unresolved_participant_id');
  });

  it('honors source and combat gates, counts no deaths as zero only with valid coverage, and selects the victim', () => {
    const ctx = context();
    ctx.sourceReason = 'incomplete_processing';
    expect(calculate(ctx)).toMatchObject({
      available: false,
      reason: 'incomplete_processing',
      deaths: [],
      coverage: { observedDeaths: null },
    });
    ctx.sourceReason = null;
    ctx.combatReason = 'incomplete_events';
    expect(calculate(ctx).coverage.availableRecaps).toBeNull();
    ctx.combatReason = null;
    expect(calculateDeathRecapReview(ctx, 'one')).toMatchObject({
      available: true,
      deaths: [],
      coverage: { observedDeaths: 0 },
    });
    expect(calculateDeathRecapReview(ctx, 'unknown').reason).toBe(
      'unknown_participant',
    );
  });
});
