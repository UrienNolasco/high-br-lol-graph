export const INDICATOR_VERSION = 1;
export const INDICATOR_FAMILIES = ['execution', 'casts', 'pings'] as const;
export type IndicatorFamily = (typeof INDICATOR_FAMILIES)[number];
export interface IndicatorDefinition {
  id: string;
  family: IndicatorFamily;
  metricId: 'C12' | 'B06' | 'B07';
  name: string;
  field: string;
  source: 'challenges' | 'finalStats' | 'pings';
  unit: 'count';
  perMinute: boolean;
}
const definitions = (
  family: IndicatorFamily,
  metricId: IndicatorDefinition['metricId'],
  source: IndicatorDefinition['source'],
  labels: Record<string, string>,
): IndicatorDefinition[] =>
  Object.entries(labels).map(([field, name]) => ({
    id: `${family}.${field}`,
    family,
    metricId,
    name,
    field,
    source,
    unit: 'count',
    perMinute: family !== 'execution',
  }));
export const INDICATOR_CATALOG: readonly IndicatorDefinition[] = [
  ...definitions('execution', 'C12', 'challenges', {
    skillshotsHit: 'Skillshots acertados registrados',
    skillshotsDodged: 'Skillshots desviados registrados',
    outnumberedKills: 'Abates em inferioridade numérica registrados',
    saveAllyFromDeath: 'Salvamentos de aliado registrados',
  }),
  ...definitions('casts', 'B06', 'finalStats', {
    spell1Casts: 'Casts do slot 1',
    spell2Casts: 'Casts do slot 2',
    spell3Casts: 'Casts do slot 3',
    spell4Casts: 'Casts do slot 4',
    summoner1Casts: 'Casts do feitiço de invocador 1',
    summoner2Casts: 'Casts do feitiço de invocador 2',
  }),
  ...definitions('pings', 'B07', 'pings', {
    allInPings: 'Pings de avançar com tudo',
    assistMePings: 'Pings de assistência',
    basicPings: 'Pings básicos',
    commandPings: 'Pings de comando',
    dangerPings: 'Pings de perigo',
    enemyMissingPings: 'Pings de inimigo desaparecido',
    enemyVisionPings: 'Pings de visão inimiga',
    getBackPings: 'Pings de recuar',
    holdPings: 'Pings de manter posição',
    needVisionPings: 'Pings de necessidade de visão',
    onMyWayPings: 'Pings de a caminho',
    pushPings: 'Pings de avançar',
    retreatPings: 'Pings de retirada',
    visionClearedPings: 'Pings de visão removida',
  }),
];
export const INDICATOR_LIMITATIONS = [
  'Final summary counters only; retrospective descriptions, never predictive features.',
  'Casts do not supply timestamps, cooldowns, missed opportunities, or an optimal rotation.',
  'skillshotsHit has no attempt denominator; no accuracy rate is calculated.',
  'Ping categories are separate counters, not a mutually exclusive taxonomy; no summed total is inferred.',
  'Pings do not reveal toxicity, intent, or communication quality.',
  'Challenge names describe Riot counters; local calculations do not verify hidden challenge attribution rules.',
  'Historical groups never mix champion, normalized role, patch, queue, map, processing generation or catalog validation status.',
];
export const indicatorCatalog = () => ({
  catalogVersion: INDICATOR_VERSION,
  optional: true,
  validatedFixturePatches: ['16.2'],
  validation:
    'Schema validation of optional nonnegative integer counters; real corpus contains one match in patch16.2, no claim of cross-version semantic validation',
  definitions: INDICATOR_CATALOG.map((d) => ({
    ...d,
    definitionVersion: INDICATOR_VERSION,
    absence: 'missing_field',
    validation: 'finite nonnegative safe integer',
    derivedUnit: d.perMinute ? 'count_per_minute' : null,
  })),
  limitations: INDICATOR_LIMITATIONS,
});
