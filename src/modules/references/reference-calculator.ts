import { createHash } from 'node:crypto';
import {
  ReferenceObservation,
  referenceStatistics,
  selectRosterDisjoint,
  REFERENCE_METHOD_VERSION,
} from '../../core/statistics/empirical-reference';
import { ReferenceQuery } from './reference-contract';
import { DATASET_DEFINITION_MAP } from '../../core/dataset/dataset-registry';
export interface ReferenceRow extends ReferenceObservation {
  processedAt: Date;
  lineage: unknown;
  origin: string;
  source: unknown;
  context: {
    patch: string | null;
    queueId: number;
    mapId: number;
    championId: number | null;
    role: string | null;
    horizonKey: string;
    definitionVersion: number;
  };
}
const extent = (rows: readonly ReferenceRow[]) =>
  rows.length
    ? {
        firstGameCreationMs: rows
          .reduce((a, b) => (a.gameCreation < b.gameCreation ? a : b))
          .gameCreation.toString(),
        lastGameCreationMs: rows
          .reduce((a, b) => (a.gameCreation > b.gameCreation ? a : b))
          .gameCreation.toString(),
      }
    : null;
export function calculateReference(
  query: ReferenceQuery,
  rows: readonly ReferenceRow[],
  individual: ReferenceRow | null,
  unmaterializedMatches: number,
  tooLarge = false,
  totalCandidates = rows.length,
) {
  for (const row of rows.concat(individual ? [individual] : []))
    for (const field of [
      'patch',
      'queueId',
      'mapId',
      'championId',
      'role',
      'horizonKey',
    ] as const)
      if (row.context[field] !== query.filters[field])
        throw new Error(`Mixed reference context: ${field}`);
  for (const row of rows.concat(individual ? [individual] : []))
    if (
      row.context.definitionVersion !==
      DATASET_DEFINITION_MAP.get(query.definition.anchorDefinitionId)!.version
    )
      throw new Error('Mixed reference definition version');
  const eligible = rows.filter((r) => r.eligible);
  const valid = eligible.filter(
    (r) => r.value !== null && Number.isFinite(r.value),
  );
  const targetRoster = individual?.roster ?? [];
  const selection = selectRosterDisjoint(rows, targetRoster);
  const targetComparable =
    individual?.eligible &&
    individual.value !== null &&
    individual.roster.length === 10 &&
    new Set(individual.roster).size === 10 &&
    individual.roster.includes(individual.subjectId);
  const statistics = referenceStatistics(
    selection.selected.map((r) => r.value!),
    query.precision,
    targetComparable ? individual.value : null,
  );
  const targetMissingRoster =
    individual !== null &&
    (individual.roster.length !== 10 ||
      new Set(individual.roster).size !== 10 ||
      !individual.roster.includes(individual.subjectId));
  const available =
    !tooLarge && !targetMissingRoster && statistics.precision.sufficient;
  const missingReasons: Record<string, number> = {};
  for (const row of eligible.filter((r) => r.value === null))
    missingReasons[row.reason ?? 'missing_value'] =
      (missingReasons[row.reason ?? 'missing_value'] ?? 0) + 1;
  const exclusions: Record<string, number> = {};
  for (const row of selection.excluded)
    exclusions[row.reason] = (exclusions[row.reason] ?? 0) + 1;
  const result = {
    methodVersion: REFERENCE_METHOD_VERSION,
    definition: query.definition,
    filters: {
      ...query.filters,
      definitionId: query.definition.id,
      eligibleOnly: true,
    },
    datasetAnchorDefinitionId: query.definition.anchorDefinitionId,
    status: available ? 'available' : 'insufficient',
    reason: available
      ? null
      : tooLarge
        ? 'cohort_too_large'
        : targetMissingRoster
          ? 'target_roster_unknown'
          : 'insufficient_precision',
    counts: {
      candidateRows: totalCandidates,
      eligibleRows: tooLarge ? null : eligible.length,
      eligibleMatches: tooLarge
        ? null
        : new Set(eligible.map((r) => r.matchId)).size,
      eligiblePlayers: tooLarge
        ? null
        : new Set(eligible.map((r) => r.subjectId)).size,
      validEligibleRows: tooLarge ? null : valid.length,
      validEligibleMatches: tooLarge
        ? null
        : new Set(valid.map((r) => r.matchId)).size,
      validEligiblePlayers: tooLarge
        ? null
        : new Set(valid.map((r) => r.subjectId)).size,
      selectedRows: selection.selected.length,
      selectedMatches: new Set(selection.selected.map((r) => r.matchId)).size,
      selectedSubjects: new Set(selection.selected.map((r) => r.subjectId))
        .size,
      selectedRosterPlayers: new Set(
        selection.selected.flatMap((r) => r.roster),
      ).size,
    },
    coverage: {
      validEligibleRows: tooLarge ? null : valid.length,
      eligibleRows: tooLarge ? null : eligible.length,
      value: eligible.length ? valid.length / eligible.length : null,
      missingReasons,
      unmaterializedMatches,
    },
    period: {
      requestedFromMs: query.filters.fromMs ?? null,
      requestedToMs: query.filters.toMs ?? null,
      bounds: '[)',
      eligible: extent(eligible),
      selected: extent(selection.selected),
    },
    selection: {
      policy: selection.policy,
      assumptions: selection.assumptions,
      estimand:
        'Distribution within the roster-disjoint selected subcohort; not the full collection or all high-elo players',
      targetRosterExcluded: individual !== null,
      exclusions,
      selectedContributionIds: selection.selected.map((r) => r.id),
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify(
            selection.selected.map((r) => [
              r.id,
              r.value,
              r.processedAt.toISOString(),
              [...r.roster].sort(),
            ]),
          ),
        )
        .digest('hex'),
    },
    precision: statistics.precision,
    distribution: available ? statistics.distribution : null,
    median: available ? statistics.median : null,
    quantiles: available ? statistics.quantiles : null,
    individual: individual
      ? {
          contributionId: individual.id,
          matchId: individual.matchId,
          puuid: individual.subjectId,
          value: individual.value,
          reason: individual.reason,
          eligible: individual.eligible,
          source: individual.source,
          processedAt: individual.processedAt.toISOString(),
          percentile: available ? statistics.individualPercentile : null,
        }
      : null,
    observations: {
      items: rows.slice(0, 50).map((r) => ({
        contributionId: r.id,
        matchId: r.matchId,
        puuid: r.subjectId,
        value: r.value,
        reason: r.reason,
        eligible: r.eligible,
        processedAt: r.processedAt.toISOString(),
      })),
      returned: Math.min(rows.length, 50),
      total: totalCandidates,
      truncated: totalCandidates > 50,
      purpose:
        'Individual observations, not additional independent units; bounded to the first 50 by chronological query order',
    },
    provenance: {
      processedAt: rows.length
        ? {
            earliest: new Date(
              Math.min(...rows.map((r) => r.processedAt.getTime())),
            ).toISOString(),
            latest: new Date(
              Math.max(...rows.map((r) => r.processedAt.getTime())),
            ).toISOString(),
          }
        : null,
      lineageUnknownRows: rows.filter(
        (r) => (r.lineage as { status?: string } | null)?.status !== 'observed',
      ).length,
      rankMeaning: 'Collected rank is not match-time rank',
      method:
        'Empirical inverse CDF/type1; lower median for even N; ties use midrank. Simultaneous nominal DKW-Massart band conditional on iid selected units. No competitive rank.',
    },
  };
  return result;
}
