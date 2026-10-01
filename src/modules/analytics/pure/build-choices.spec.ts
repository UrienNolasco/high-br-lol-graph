import {
  calculateBuildChoices,
  normalizeBuildChoiceFilters,
} from './build-choices';
import {
  choiceMatch,
  choiceCohort,
  choiceFilters,
  choiceCatalogs,
} from './build-choices.fixture';
const result = (matches = [choiceMatch()], catalogs = choiceCatalogs()) =>
  calculateBuildChoices(choiceCohort(matches), choiceFilters, catalogs);
describe('MET26 contextual choices method1', () => {
  it('exposes denominators, matchup, resources, nominal uncertainty, acquisition evidence and versioned IDs', () => {
    const r = result();
    expect(r.coverage.eligibleMatches).toBe(1);
    const c = r.contexts[0];
    expect(c).toMatchObject({
      opponentChampionId: 2,
      goldBin: { lower: 6000, upperExclusive: 8000 },
      denominators: { items: 1, runes: 1, summoners: 1 },
    });
    expect(c.alternatives.items[0]).toMatchObject({
      ids: [100],
      n: 1,
      denominatorN: 1,
      meanAcquisitionMs: 600000,
      meanTotalGold: 6000,
      sufficient: false,
      catalogVersions: ['16.2.1'],
      comparison: { n: 0, winRate: null, interval95: null },
      evidence: [
        {
          eventId: 'm1:10:0',
          frameTimestampMs: 900000,
          sourceMaxTimestampMs: 900000,
        },
      ],
    });
    expect(c.alternatives.items[0].interval95!.lower).toBeCloseTo(0.2065, 3);
    expect(c.alternatives.summoners[0].ids).toEqual([4, 12]);
    expect(c.alternatives.runes[0].metadata.at(-1)).toMatchObject({
      id: 5002,
      name: null,
      reason: 'stat_perk_catalog_unavailable',
    });
  });
  it('reports resources at acquisition separately, with pastOnly coverage and no future replacement', () => {
    const m = choiceMatch();
    let r = result([m]);
    expect(
      r.contexts[0].alternatives.items[0].acquisitionResources,
    ).toMatchObject({
      validN: 0,
      totalN: 1,
      meanTotalGold: null,
      missingReason: 'missing_past_acquisition_resources',
    });
    const frame = structuredClone(m.timelineProjection!.frames[0]);
    frame.timestamp = 540000;
    frame.frameIndex = 9;
    frame.participantFrames['1'].totalGold = 4000;
    frame.participantFrames['1'].currentGold = 2000;
    m.timelineProjection!.frames.push(frame);
    r = result([m]);
    expect(
      r.contexts[0].alternatives.items[0].acquisitionResources,
    ).toMatchObject({
      validN: 1,
      meanTotalGold: 4000,
      meanCurrentGold: 2000,
      missingReason: null,
    });
    expect(r.contexts[0].alternatives.items[0].meanTotalGold).toBe(6000);
    expect(
      r.contexts[0].alternatives.items[0].evidence[0]
        .acquisitionFrameTimestampMs,
    ).toBe(540000);
    frame.timestamp = 600001;
    expect(
      result([m]).contexts[0].alternatives.items[0].acquisitionResources!
        .validN,
    ).toBe(0);
  });
  it('undo by checkpoint cancels choice while future undo and purchases cannot rewrite it', () => {
    const m = choiceMatch();
    const purchase = m.events[0];
    m.events.push({
      ...purchase,
      eventIndex: 1,
      type: 'ITEM_UNDO',
      timestampMs: 660000,
      payload: { beforeId: 100, afterId: 0, goldGain: 300 },
    });
    expect(result([m]).contexts[0].alternatives.items).toEqual([]);
    m.events.at(-1)!.timestampMs = 960000;
    m.events.push({
      ...purchase,
      eventIndex: 2,
      timestampMs: 1000000,
      payload: { itemId: 101 },
    });
    expect(
      result([m]).contexts[0].alternatives.items.map((x) => x.ids),
    ).toEqual([[100]]);
  });
  it('uses all known eligible nonbuyers as denominator and complement; deduplicates matches/events', () => {
    const a = choiceMatch(),
      b = choiceMatch('m2');
    b.participants[0].win = false;
    b.events.at(-1)!.payload = { winningTeam: 200 };
    b.events = b.events.filter((e) => e.type !== 'ITEM_PURCHASED');
    a.events.push({ ...a.events[0] });
    const r = result([a, b, a]);
    expect(r.coverage.exclusions.duplicate_match).toBe(1);
    expect(r.contexts[0].alternatives.items[0]).toMatchObject({
      n: 1,
      denominatorN: 2,
      share: 0.5,
      comparison: { n: 1, wins: 0, winRate: 0 },
    });
  });
  it.each([
    'short',
    'future',
    'stale',
    'missing-resource',
    'ambiguous-role',
    'ambiguous-subject',
    'population',
    'generation',
    'end',
    'missing-timeline',
  ])('excludes %s from every denominator', (kind) => {
    const m = choiceMatch();
    if (kind === 'short') m.gameDuration = 899;
    if (kind === 'future') m.timelineProjection!.frames[0].timestamp = 900001;
    if (kind === 'stale') m.timelineProjection!.frames[0].timestamp = 839999;
    if (kind === 'missing-resource')
      m.timelineProjection!.frames[0].participantFrames['1'].currentGold = null;
    if (kind === 'ambiguous-role')
      m.participants.push({ ...m.participants[1], puuid: 'enemy2' });
    if (kind === 'ambiguous-subject')
      m.participants.push({ ...m.participants[0], puuid: 'hero2' });
    if (kind === 'population') m.populationEligible = null;
    if (kind === 'generation') m.events[0].processingVersion = 4;
    if (kind === 'end') m.events.at(-1)!.timestampMs = 1700000;
    if (kind === 'missing-timeline') m.timelineProjection = null;
    const r = result([m]);
    expect(r.coverage.eligibleMatches).toBe(0);
    expect(r.contexts).toEqual([]);
    expect(Object.values(r.coverage.exclusions)).toEqual([1]);
  });
  it('keeps runes/spells denominators when item trajectory is ambiguous and reports absence', () => {
    const m = choiceMatch();
    m.events.push({
      ...m.events[0],
      eventIndex: 2,
      type: 'ITEM_UNDO',
      timestampMs: 660000,
      payload: { beforeId: 101, afterId: 0, goldGain: 300 },
    });
    const r = result([m]);
    expect(r.contexts[0].denominators).toEqual({
      items: 0,
      runes: 1,
      summoners: 1,
    });
    expect(r.coverage.missingness.items_unknown_catalog_or_trajectory).toBe(1);
  });
  it('missing item timestamp never fabricates an acquisition, unknown item/type remains unavailable', () => {
    for (const kind of ['timestamp', 'unknown-id', 'unknown-type']) {
      const m = choiceMatch();
      if (kind === 'timestamp') m.events[0].timestampMs = null;
      if (kind === 'unknown-id') m.events[0].payload = { itemId: 99999 };
      if (kind === 'unknown-type')
        m.events.push({
          ...m.events[0],
          eventIndex: 1,
          type: 'FUTURE_ITEM_CHANGE',
          quality: { unknownType: true },
        });
      expect(result([m]).contexts[0].denominators.items).toBe(0);
    }
  });
  it('rejects malformed runes, unknown summoner IDs and wrong-version catalogs without zeros', () => {
    const m = choiceMatch();
    (m.participants[0].runes as any).styles[0].selections[0].perk = 9999;
    m.participants[0].spells = [4, 9999];
    const r = result([m]);
    expect(r.contexts[0].denominators).toEqual({
      items: 1,
      runes: 0,
      summoners: 0,
    });
    const c = choiceCatalogs();
    c['16.2.741'].choices.version = '16.3.1';
    c['16.2.741'].items.version = '16.3.1';
    expect(result([choiceMatch()], c).contexts[0].denominators).toEqual({
      items: 0,
      runes: 0,
      summoners: 0,
    });
  });
  it('separates known matchup and gold bands; does not merge patches', () => {
    const a = choiceMatch(),
      b = choiceMatch('m2'),
      c = choiceMatch('m3'),
      d = choiceMatch('m4');
    b.participants[1].championId = 3;
    c.timelineProjection!.frames[0].participantFrames['1'].totalGold = 8000;
    d.gameVersion = '16.20.1';
    const r = result([a, b, c, d]);
    expect(r.contexts).toHaveLength(3);
    expect(r.coverage.exclusions.different_patch).toBe(1);
    expect(
      calculateBuildChoices(
        choiceCohort([a, b]),
        { ...choiceFilters, opponentChampionId: 2 },
        choiceCatalogs(),
      ).coverage.exclusions.different_matchup,
    ).toBe(1);
  });
  it('empty cohort yields explicit N0 and truncation is preserved', () => {
    const r = calculateBuildChoices(
      { matches: [], totalMatches: 20, truncated: true },
      choiceFilters,
      {},
    );
    expect(r.coverage).toMatchObject({
      eligibleMatches: 0,
      returnedMatches: 0,
      queriedMatches: 20,
      truncated: true,
    });
    expect(r.contexts).toEqual([]);
  });
  it.each([
    { patch: 'ALL' },
    { role: 'ALL' },
    { championId: 0 },
    { checkpointMs: 59000 },
    { limit: 501 },
    { fromMs: 10, toMs: 10 },
    { opponentChampionId: -1 },
    { unexpected: 1 },
  ])('rejects invalid filter %j', (bad) =>
    expect(() =>
      normalizeBuildChoiceFilters({ ...choiceFilters, ...bad }),
    ).toThrow(),
  );
  it('normalizes role alias, exact patch and integer strings', () =>
    expect(
      normalizeBuildChoiceFilters({
        patch: '016.02',
        role: 'MID',
        championId: '1',
      }),
    ).toMatchObject({ patch: '16.2', role: 'MIDDLE', checkpointMs: 900000 }));
});
