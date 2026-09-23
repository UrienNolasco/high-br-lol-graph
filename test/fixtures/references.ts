import { ReferenceRow } from '../../src/modules/references/reference-calculator';
export const referenceQueryFixture = {
  patch: '16.2',
  queueId: 420,
  mapId: 11,
  championId: 103,
  role: 'MIDDLE',
  definitionId: 'snapshot.totalGold',
  horizonKey: 't:900000',
};
/** Fully synthetic independent identities; not evidence for an actual population. */
export function referenceRowFixture(i: number): ReferenceRow {
  return {
    id: i.toString(16).padStart(64, '0'),
    matchId: `MET20_${i}`,
    subjectId: `MET20_${i}:0`,
    gameCreation: BigInt(1000 + i),
    value: i,
    roster: Array.from({ length: 10 }, (_, j) => `MET20_${i}:${j}`),
    eligible: true,
    reason: null,
    processedAt: new Date('2026-09-23T00:00:00Z'),
    lineage: { status: 'unknown', reason: 'synthetic_fixture' },
    origin: 'observed',
    source: { synthetic: true },
    context: {
      patch: '16.2',
      queueId: 420,
      mapId: 11,
      championId: 103,
      role: 'MIDDLE',
      horizonKey: 't:900000',
      definitionVersion: 1,
    },
  };
}
