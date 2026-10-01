import { PatchComparisonController } from './patch-comparison.controller';
import type { DatasetReader } from '../dataset/ports/dataset-reader';
describe('patch comparison filters', () => {
  const query = jest.fn().mockResolvedValue({
    rows: [],
    nextAfter: null,
    summary: { unmaterializedMatches: 2 },
  });
  const controller = new PatchComparisonController({ query } as DatasetReader);
  beforeEach(() => query.mockClear());
  it.each([
    {},
    { beforePatch: 'ALL', afterPatch: '1.2', definitionId: 'final.gold' },
    { beforePatch: '1.1', afterPatch: '1.1', definitionId: 'final.gold' },
    { beforePatch: '1.1', afterPatch: '1.2', definitionId: 'unknown' },
    {
      beforePatch: '1.1',
      afterPatch: '1.2',
      definitionId: 'final.gold',
      limit: '0',
    },
    {
      beforePatch: '1.1',
      afterPatch: '1.2',
      definitionId: 'final.gold',
      eligibleOnly: false,
    },
  ])('rejects invalid input %j', async (raw) => {
    await expect(controller.read(raw)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('requests a single shared bounded participant cohort with canonical role and dates', async () => {
    const result = await controller.read({
      beforePatch: '16.1',
      afterPatch: '16.2',
      definitionId: 'final.gold',
      role: 'MID',
      fromMs: '0',
      toMs: '1000',
    });
    expect(query).toHaveBeenCalledWith(
      {
        definitionId: 'final.gold',
        role: 'MIDDLE',
        fromMs: 0,
        toMs: 1000,
        subjectKind: 'participant',
        eligibleOnly: true,
        mapId: 11,
        queueId: 420,
        horizonKey: 'final',
      },
      10000,
    );
    expect(result.unmaterializedMatches).toBe(2);
    expect(result.before.matches).toBe(0);
  });
});

describe('definition and horizon compatibility', () => {
  const query = jest.fn();
  const controller = new PatchComparisonController({ query } as DatasetReader);
  it.each([
    { definitionId: 'final.gold', horizonKey: 't:600000' },
    { definitionId: 'snapshot.totalGold', horizonKey: 'final' },
    { definitionId: 'final.objectives.dragon', horizonKey: 'final' },
  ])('rejects incompatible selection %j', async (selection) => {
    await expect(
      controller.read({
        beforePatch: '16.1',
        afterPatch: '16.2',
        ...selection,
      }),
    ).rejects.toThrow('incompatible');
    expect(query).not.toHaveBeenCalled();
  });
});
