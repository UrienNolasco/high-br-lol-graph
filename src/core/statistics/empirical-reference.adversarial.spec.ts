import { ReferenceService } from '../../modules/references/reference.service';
import { ReferenceRepository } from '../../modules/references/adapters/reference.repository';
import { normalizeReferenceQuery } from '../../modules/references/reference-contract';
import {
  referenceQueryFixture,
  referenceRowFixture,
} from '../../../test/fixtures/references';
import { PROCESSING_VERSION } from '../../lib/processing-policy';

/** A canonical dataset role is not necessarily the original participant role. */
describe('MET20 adversarial source/cohort boundary', () => {
  it.each([
    ['vision.controlWardsBought', 'visionWardsBoughtInGame', 0],
    ['vision.controlWardsBought', 'visionWardsBoughtInGame', 2],
    ['vision.controlWardsPlaced', 'detectorWardsPlaced', 0],
    ['vision.controlWardsPlaced', 'detectorWardsPlaced', 2],
  ] as const)(
    'preserves %s (%s=%i) when stored MID has a canonical MIDDLE anchor',
    async (definitionId, field, value) => {
      const target = referenceRowFixture(0);
      const anchor = {
        ...target,
        ...target.context,
        definitionId: 'final.visionScore',
        horizonKey: 'final',
        definitionVersion: 1,
        datasetVersion: 1,
        processingVersion: PROCESSING_VERSION,
        validCount: 1,
      };
      const participants = target.roster.map((puuid, index) => ({
        matchId: target.matchId,
        puuid,
        championId: index === 0 ? 103 : index,
        role: index === 0 ? 'MID' : 'TOP',
        finalStats: {
          projectionVersion: 1,
          values: { [field]: value },
          missingReasons: {},
        },
      }));
      // Apply source-table filters instead of returning a permissive mock regardless of where.
      type Where = {
        OR?: Where[];
        matchId?: string | { in: string[] };
        puuid?: string | { in: string[] };
        championId?: number;
        role?: string;
      };
      const matches = (
        participant: (typeof participants)[number],
        where: Where,
      ): boolean => {
        if (
          where.OR &&
          !where.OR.some((clause: Where) => matches(participant, clause))
        )
          return false;
        return (['matchId', 'puuid', 'championId', 'role'] as const).every(
          (key) => {
            const expected = where[key];
            return (
              expected === undefined ||
              (expected !== null &&
              typeof expected === 'object' &&
              Array.isArray(expected.in)
                ? expected.in.includes(String(participant[key]))
                : participant[key] === expected)
            );
          },
        );
      };
      const tx = {
        historicalMetricContribution: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue([anchor]),
          findFirst: jest.fn().mockResolvedValue(anchor),
        },
        matchParticipant: {
          findMany: jest.fn(({ where }: { where: Where }) =>
            Promise.resolve(participants.filter((p) => matches(p, where))),
          ),
        },
        match: { count: jest.fn().mockResolvedValue(0) },
      };
      const service = new ReferenceService(
        new ReferenceRepository({
          $transaction: (callback: (client: typeof tx) => unknown) =>
            callback(tx),
        } as never),
      );
      const query = normalizeReferenceQuery({
        ...referenceQueryFixture,
        role: 'MID',
        definitionId,
        horizonKey: 'final',
        individualId: target.id,
      });
      const result = await service.getReference(query);
      expect(query.filters.role).toBe('MIDDLE');
      expect(result.individual).toMatchObject({
        value,
        reason: null,
        percentile: null,
      });
      expect(result.observations.items[0]).toMatchObject({
        value,
        reason: null,
      });
      expect(result.counts.validEligibleRows).toBe(1);
    },
  );
});
