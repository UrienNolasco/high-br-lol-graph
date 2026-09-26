import {
  DATASET_DEFINITIONS,
  DATASET_DEFINITION_MAP,
  DatasetDefinition,
} from '../../core/dataset/dataset-registry';
import {
  DatasetFilters,
  normalizeDatasetFilters,
} from '../../core/dataset/dataset-query';
import { precisionPolicy } from './contracts/statistics';
import type { PrecisionPolicy } from './contracts/statistics';
export interface ReferenceDefinition extends DatasetDefinition {
  anchorDefinitionId: string;
  finalField?: string;
  costUnavailable?: boolean;
}
export const REFERENCE_DEFINITIONS: ReferenceDefinition[] = [
  ...DATASET_DEFINITIONS.filter(
    (d) => d.subjectKinds.includes('participant') && d.usage !== 'label',
  ).map((d) => ({ ...d, anchorDefinitionId: d.id })),
  ...[
    ['vision.controlWardsBought', 'visionWardsBoughtInGame', 'count'],
    ['vision.controlWardsPlaced', 'detectorWardsPlaced', 'count'],
    ['vision.controlWardGoldSpent', '', 'gold'],
  ].map(([id, field, unit]) => ({
    id,
    version: 1,
    metricId: 'V08',
    usage: 'descriptive' as const,
    subjectKinds: ['participant' as const],
    unit,
    source:
      'MatchParticipant.finalStats projectionVersion1, linked by current dataset publication',
    temporalRule: 'Final retrospective reference; never a predictive feature',
    anchorDefinitionId: 'final.visionScore',
    ...(field ? { finalField: field } : { costUnavailable: true }),
  })),
];
export const REFERENCE_DEFINITION_MAP = new Map(
  REFERENCE_DEFINITIONS.map((d) => [d.id, d]),
);
export interface ReferenceQuery {
  definition: ReferenceDefinition;
  filters: DatasetFilters;
  precision: PrecisionPolicy;
  individualId?: string;
}
/** All context axes mandatory. References never pool champion, role, queue, map, patch or horizon implicitly. */
export function normalizeReferenceQuery(
  raw: Record<string, unknown>,
): ReferenceQuery {
  const { confidence, cdfHalfWidth, minimumUnits, individualId, ...cohort } =
    raw;
  const definition =
    typeof cohort.definitionId === 'string'
      ? REFERENCE_DEFINITION_MAP.get(cohort.definitionId)
      : undefined;
  if (!definition) throw new Error('Unknown participant reference definition');
  for (const key of [
    'patch',
    'queueId',
    'mapId',
    'championId',
    'role',
    'horizonKey',
  ])
    if (cohort[key] === undefined)
      throw new Error(`Homogeneous reference requires ${key}`);
  for (const forbidden of ['subjectKind', 'usage', 'eligibleOnly', 'playerId'])
    if (cohort[forbidden] !== undefined)
      throw new Error(
        `Reference controls ${forbidden}; use explicit individualId for a target`,
      );
  const filters = normalizeDatasetFilters({
    ...cohort,
    definitionId: definition.anchorDefinitionId,
    subjectKind: 'participant',
    usage: definition.usage,
    eligibleOnly: false,
  });
  for (const key of ['queueId', 'mapId', 'championId'] as const)
    if (filters[key]! > 2147483647)
      throw new Error(`${key} exceeds database Int32 range`);
  if ((definition.usage === 'predictive') === (filters.horizonKey === 'final'))
    throw new Error('Definition and horizon are incompatible');
  if (!DATASET_DEFINITION_MAP.has(definition.anchorDefinitionId))
    throw new Error('Missing dataset anchor');
  const numeric = (value: unknown, fallback: number) =>
    value === undefined
      ? fallback
      : typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : NaN;
  const precision = precisionPolicy({
    confidence: numeric(confidence, 0.95),
    cdfHalfWidth: numeric(cdfHalfWidth, 0.15),
    minimumUnits: numeric(minimumUnits, 0),
  });
  if (
    individualId !== undefined &&
    (typeof individualId !== 'string' || !/^[a-f0-9]{64}$/.test(individualId))
  )
    throw new Error('individualId must be the dataset anchor contribution ID');
  return {
    definition,
    filters,
    precision,
    ...(individualId ? { individualId: individualId } : {}),
  };
}
