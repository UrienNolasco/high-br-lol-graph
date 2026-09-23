export const DATASET_VERSION = 1;
export const DATASET_HORIZONS = [300000, 600000, 900000, 1200000] as const;
export type DatasetUsage = 'predictive' | 'descriptive' | 'label';
export type DatasetSubject = 'participant' | 'team' | 'match';
export interface DatasetDefinition {
  id: string;
  version: number;
  metricId: string;
  usage: DatasetUsage;
  subjectKinds: DatasetSubject[];
  unit: string;
  source: string;
  temporalRule: string;
  path?: string;
}
const predictive = (
  id: string,
  metricId: string,
  unit: string,
  source: string,
  subjectKinds: DatasetSubject[] = ['participant'],
): DatasetDefinition => ({
  id,
  version: 1,
  metricId,
  usage: 'predictive',
  subjectKinds,
  unit,
  source,
  temporalRule:
    'Only explicitly timestamped source <= horizon; pastOnly snapshot tolerance60000ms. Final reconciliation/outcome never gates feature values.',
});
export const SNAPSHOT_DATASET_FIELDS = {
  totalGold: ['E01', 'gold'],
  currentGold: ['E05', 'gold'],
  xp: ['E01', 'xp'],
  level: ['E07', 'level'],
  minionsKilled: ['E02', 'cs'],
  jungleMinionsKilled: ['E02', 'cs'],
  totalCs: ['E01', 'cs'],
} as const;
export const EVENT_DATASET_FIELDS = {
  kills: ['C01', 'CHAMPION_KILL', 'actor'],
  deaths: ['C01', 'CHAMPION_KILL', 'victim'],
  assists: ['C01', 'CHAMPION_KILL', 'assistants'],
  soloKills: ['E08', 'CHAMPION_KILL', 'solo'],
  wardsPlaced: ['V01', 'WARD_PLACED', 'actor'],
  wardsKilled: ['V02', 'WARD_KILL', 'actor'],
  epicObjectiveLastHits: ['O01', 'ELITE_MONSTER_KILL', 'actor'],
} as const;
const contributionPaths: Array<[string, string, string, string]> = [
  ['final.gold', 'E04', 'gold', 'resources.gold.absolute'],
  ['final.goldPerMinute', 'E04', 'gold_per_minute', 'resources.gold.perMinute'],
  ['final.goldShare', 'E04', 'percent', 'resources.gold.teamShare'],
  ['final.cs', 'E04', 'cs', 'resources.cs.absolute'],
  ['final.csPerMinute', 'E04', 'cs_per_minute', 'resources.cs.perMinute'],
  ['final.damage', 'C02', 'damage', 'combat.damage.absolute'],
  [
    'final.damagePerMinute',
    'C02',
    'damage_per_minute',
    'combat.damage.perMinute',
  ],
  ['final.damageShare', 'C02', 'percent', 'combat.damage.teamShare'],
  [
    'final.damageToGoldShareRatio',
    'C02',
    'ratio',
    'combat.damageToGoldShareRatio',
  ],
  ['final.killParticipation', 'C01', 'percent', 'combat.killParticipation'],
  ['final.damageTaken', 'C03', 'damage', 'combat.damageTaken.absolute'],
  ['final.allyHealing', 'C04', 'health', 'combat.allyHealing.absolute'],
  ['final.allyShielding', 'C04', 'damage', 'combat.allyShielding.absolute'],
  ['final.crowdControl', 'C05', 'seconds', 'combat.crowdControl.absolute'],
  ['final.deadTime', 'C06', 'seconds', 'combat.deadTime'],
  ['final.visionScore', 'V04', 'score', 'vision.score.absolute'],
  ['final.turretDamage', 'O03', 'damage', 'structures.turretDamage.absolute'],
];
const finalDefinition = (
  id: string,
  metricId: string,
  unit: string,
  source: string,
  subjectKinds: DatasetSubject[] = ['participant'],
  path?: string,
): DatasetDefinition => ({
  id,
  metricId,
  unit,
  source,
  subjectKinds,
  path,
  usage: 'descriptive',
  version: 1,
  temporalRule:
    'Final retrospective observation. Never include in predictive feature files.',
});
export const DATASET_DEFINITIONS: readonly DatasetDefinition[] = [
  ...Object.entries(SNAPSHOT_DATASET_FIELDS).map(([field, [metricId, unit]]) =>
    predictive(
      `snapshot.${field}`,
      metricId,
      unit,
      'MET03 timestamped snapshots',
      ['totalGold', 'xp', 'totalCs'].includes(field)
        ? ['participant', 'team']
        : ['participant'],
    ),
  ),
  ...Object.entries(EVENT_DATASET_FIELDS).map(([field, [metricId]]) =>
    predictive(
      `events.${field}`,
      metricId,
      'count',
      'MET04 normalized timestamped event prefix',
      field === 'kills' || field === 'wardsPlaced' || field === 'wardsKilled'
        ? ['participant', 'team', 'match']
        : ['participant'],
    ),
  ),
  ...contributionPaths.map(([id, metricId, unit, path]) =>
    finalDefinition(
      id,
      metricId,
      unit,
      'MET10 computeContribution',
      ['participant'],
      `dimensions.${path}`,
    ),
  ),
  ...['placements', 'removals'].map((field) =>
    finalDefinition(
      `final.vision.${field}`,
      field === 'placements' ? 'V01' : 'V02',
      'count',
      'MET11 calculateVision',
      ['participant'],
      `metrics.${field === 'placements' ? 'recognizedPlacements' : 'recognizedRemovals'}`,
    ),
  ),
  ...['kills', 'deaths', 'assists'].map((field) =>
    finalDefinition(
      `final.combat.${field}`,
      'C01',
      'count',
      'MET13 calculateCombat',
      ['participant'],
      `events.${field}`,
    ),
  ),
  ...['dragon', 'baron', 'riftHerald', 'horde', 'tower', 'inhibitor'].map(
    (field) =>
      finalDefinition(
        `final.objectives.${field}`,
        'O01',
        'count',
        'MET14 calculateObjectives',
        ['team'],
        `objectives.${field}.kills`,
      ),
  ),
  finalDefinition(
    'final.deathsNearObjectives',
    'C07',
    'percent',
    'MET15 calculateSequences',
    ['participant'],
  ),
  finalDefinition(
    'final.objectivesAfterKills60',
    'O05',
    'percent',
    'MET15 calculateSequences',
    ['team'],
  ),
  finalDefinition(
    'final.winnerObservedDeficit',
    'O08',
    'gold',
    'MET15 calculateSequences',
    ['match'],
  ),
  {
    id: 'label.win',
    version: 1,
    metricId: 'outcome',
    unit: 'binary',
    source: 'MatchParticipant/MatchTeam.win',
    subjectKinds: ['participant', 'team'],
    usage: 'label',
    temporalRule:
      'Final outcome; labels file only, never a predictive feature.',
  },
];
export const DATASET_DEFINITION_MAP = new Map(
  DATASET_DEFINITIONS.map((d) => [d.id, d]),
);
