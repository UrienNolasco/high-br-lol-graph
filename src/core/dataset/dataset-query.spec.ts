import {
  datasetSqlWhere,
  datasetWhere,
  normalizeDatasetFilters,
  unmaterializedMatchWhere,
} from './dataset-query';

describe('historical dataset common cohort filters', () => {
  it('normalizes aliases and exact patch, keeps period half-open and distinguishes posthoc eligibility', () => {
    const filters = normalizeDatasetFilters({
      patch: '16.02',
      queueId: '420',
      mapId: '11',
      championId: '103',
      role: 'MID',
      fromMs: '0',
      toMs: '1000',
      eligibleOnly: 'false',
      playerId: 'p',
    });
    expect(filters).toEqual({
      patch: '16.2',
      queueId: 420,
      mapId: 11,
      championId: 103,
      role: 'MIDDLE',
      fromMs: 0,
      toMs: 1000,
      eligibleOnly: false,
      playerId: 'p',
    });
    expect(datasetWhere(filters)).toMatchObject({
      patch: '16.2',
      gameCreation: { gte: 0n, lt: 1000n },
      playerIds: { has: 'p' },
    });
    expect(datasetWhere(filters)).not.toHaveProperty('eligible');
    expect(unmaterializedMatchWhere(filters)).toMatchObject({
      OR: [{ gameVersion: '16.2' }, { gameVersion: { startsWith: '16.2.' } }],
    });
  });
  it.each([
    { patch: '16.2.x' },
    { role: 'unknown' },
    { queueId: '420 OR true' },
    { fromMs: 10, toMs: 10 },
    { toMs: Infinity },
    { horizonKey: 't:901000' },
    { usage: 'outcome' },
    { definitionId: 'secret' },
    { eligibleOnly: 'yes' },
    { raw: true },
  ])('rejects invalid/covert query filters %j', (raw) =>
    expect(() => normalizeDatasetFilters(raw)).toThrow(),
  );
  it('binds values including an adversarial player ID; exclusions remove only the eligible condition', () => {
    const filters = normalizeDatasetFilters({
      playerId: "p' OR true --",
      patch: '16.2',
    });
    const sql = datasetSqlWhere(filters);
    expect(sql.text).not.toContain("p' OR true");
    expect(sql.values).toContain("p' OR true --");
    expect(sql.text).toContain('eligible=true');
    expect(datasetSqlWhere(filters, true).text).not.toContain('eligible=true');
    expect(datasetWhere(filters)).toHaveProperty('eligible', true);
  });
});
