import { PlayerOutcomePersistenceReader } from './player-outcome-reader';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import {
  DATASET_VERSION,
  DATASET_DEFINITION_MAP,
} from '../contracts/definition';
import { DATASET_PROCESSING_VERSION } from '../contracts/processing';
describe('dataset-owned player outcomes', () => {
  const table = { count: jest.fn(), findMany: jest.fn() };
  const reader = new PlayerOutcomePersistenceReader({
    client: () => ({ historicalMetricContribution: table }),
  } as unknown as ReadSnapshot);
  const scope = {
    playerId: 'p',
    queueId: 420,
    mapId: 11,
    fromMs: 0,
    toMs: 100,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    table.count.mockResolvedValue(1);
    table.findMany.mockResolvedValue([{ matchId: 'm' }]);
  });
  it('uses exact generation and player identity without filtering excluded chronology', async () => {
    await reader.read(scope, 10000);
    expect(table.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        datasetVersion: DATASET_VERSION,
        processingVersion: DATASET_PROCESSING_VERSION,
        definitionVersion: DATASET_DEFINITION_MAP.get('label.win')!.version,
        definitionId: 'label.win',
        subjectId: 'p',
        gameCreation: { gte: 0n, lt: 100n },
      }),
    });
    expect(table.count.mock.calls[0][0].where).not.toHaveProperty('eligible');
    expect(table.findMany.mock.calls[0][0]).not.toHaveProperty('include');
  });
  it('avoids publishing truncated anchors and exposes materialized IDs separately', async () => {
    table.count.mockResolvedValue(10001);
    expect(await reader.read(scope, 10000)).toMatchObject({
      anchors: [],
      total: 10001,
      tooLarge: true,
    });
    expect(table.findMany).not.toHaveBeenCalled();
    expect(await reader.matchIds(scope)).toEqual(['m']);
  });
});
