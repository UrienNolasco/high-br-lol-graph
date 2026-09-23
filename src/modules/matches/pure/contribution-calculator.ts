import {
  metricContext,
  metricValue,
  unavailableMetric,
  metricQuality,
  MetricResult,
  MetricEvidence,
  MetricUnit,
  MissingReason,
  MetricQuality,
} from '../../../core/metrics/metric-contract';
import { normalizeRole } from '../../../core/metrics';

export interface ContributionParticipant {
  puuid: string;
  championId: number;
  championName: string;
  teamId: number;
  role: string;
  kills: number | null;
  assists: number | null;
  finalStats: unknown;
}
export interface ContributionInput {
  matchId: string;
  mapId: number;
  processingVersion: number;
  processedAt: string;
  participants: ContributionParticipant[];
}
interface Observation {
  value: number | null;
  reason: MissingReason | null;
  evidence: MetricEvidence[];
  quality: MetricQuality;
}
export interface ContributionMeasure {
  absolute: MetricResult;
  perMinute: MetricResult;
  teamShare: MetricResult;
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const valid = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
function field(
  participant: ContributionParticipant,
  name: string,
): Observation {
  const isCore = name === 'kills' || name === 'assists';
  const projection = object(participant.finalStats);
  const raw = isCore ? participant[name] : object(projection.values)[name];
  const reason: MissingReason | null =
    !isCore && !participant.finalStats
      ? 'not_calculated'
      : !isCore && projection.projectionVersion !== 1
        ? 'unsupported_version'
        : valid(raw)
          ? null
          : raw == null
            ? object(projection.missingReasons)[name] === 'invalid_value'
              ? 'invalid_value'
              : 'missing_field'
            : 'invalid_value';
  const value = reason ? null : (raw as number);
  return {
    value,
    reason,
    evidence: [
      {
        source: 'MatchParticipant',
        field: `${participant.puuid}.${isCore ? name : `finalStats.values.${name}`}`,
        value,
      },
    ],
    quality: metricQuality(value === null ? 0 : 1, 1),
  };
}
function sum(observations: Observation[]): Observation {
  const missing = observations.find((o) => o.reason);
  const total = missing
    ? null
    : observations.reduce((value, o) => value + o.value!, 0);
  const reason =
    missing?.reason ?? (Number.isFinite(total) ? null : 'invalid_value');
  return {
    value: reason ? null : total,
    reason,
    evidence: observations.flatMap((o) => o.evidence),
    quality: metricQuality(
      observations.reduce((n, o) => n + o.quality.validSamples, 0),
      observations.reduce((n, o) => n + o.quality.totalSamples, 0),
    ),
  };
}
const cs = (p: ContributionParticipant) =>
  sum([field(p, 'totalMinionsKilled'), field(p, 'neutralMinionsKilled')]);

const ROLE_EXPLANATIONS: Record<string, string> = {
  TOP: 'Leia recursos, dano e estruturas junto ao campeão e à função exercida; pressão lateral não aparece toda nos abates.',
  JUNGLE:
    'Leia recursos e combate junto às responsabilidades de jungle; estes totais não medem todas as capturas ou decisões de objetivo.',
  MIDDLE:
    'Leia dano e recursos junto ao campeão e ao contexto; participação em estruturas e visão também descreve contribuição.',
  BOTTOM:
    'Leia recursos e dano junto ao campeão e à duração observada; alcance e função de combate variam.',
  UTILITY:
    'Cura, escudos, controle de grupo e visão tornam contribuições de suporte visíveis; dano e ouro baixos não determinam ineficiência.',
  UNKNOWN:
    'Papel desconhecido: preserve as dimensões separadas e não compare totais como uma nota universal.',
};

/** Final descriptive metrics only. No raw access, rating, or outcome inference. */
export function computeContribution(
  input: ContributionInput,
  player: ContributionParticipant,
) {
  const team = input.participants.filter((p) => p.teamId === player.teamId);
  const rosterValid =
    input.mapId === 11 &&
    [100, 200].includes(player.teamId) &&
    team.length === 5 &&
    new Set(team.map((p) => p.puuid)).size === 5;
  const rosterReason: MissingReason =
    input.mapId !== 11
      ? 'unsupported_version'
      : ![100, 200].includes(player.teamId)
        ? 'missing_field'
        : new Set(team.map((p) => p.puuid)).size !== team.length
          ? 'invalid_value'
          : 'insufficient_sample';
  const teamSum = (
    read: (p: ContributionParticipant) => Observation,
  ): Observation => {
    const uniqueTeam = [...new Map(team.map((p) => [p.puuid, p])).values()];
    const result = sum(uniqueTeam.map(read));
    // Missing roster members are missing operand observations, not zero values.
    const expectedPerPlayer = team.length
      ? read(team[0]).quality.totalSamples
      : 1;
    result.quality = metricQuality(
      result.quality.validSamples,
      Math.max(5, team.length) * expectedPerPlayer,
    );
    if (!rosterValid) return { ...result, value: null, reason: rosterReason };
    return result;
  };
  const context = (
    metricId: string,
    unit: MetricUnit,
    observation: Observation,
    denominator: {
      observation: Observation;
      unit: string;
      population: string;
    } | null = null,
    teamSubject = false,
  ) => {
    const evidence = new Map<string, MetricEvidence>();
    let duplicateFields = 0;
    let duplicateValidFields = 0;
    for (const entry of [
      ...observation.evidence,
      ...(denominator?.observation.evidence ?? []),
    ]) {
      const key = `${entry.source}:${entry.field}`;
      if (evidence.has(key)) {
        duplicateFields++;
        if (entry.value !== null) duplicateValidFields++;
      } else evidence.set(key, entry);
    }
    const validSamples =
      observation.quality.validSamples +
      (denominator?.observation.quality.validSamples ?? 0) -
      duplicateValidFields;
    const totalSamples =
      observation.quality.totalSamples +
      (denominator?.observation.quality.totalSamples ?? 0) -
      duplicateFields;
    return metricContext({
      metricId,
      matchId: input.matchId,
      processingVersion: input.processingVersion,
      processedAt: input.processedAt,
      subject: teamSubject
        ? { kind: 'team', id: String(player.teamId) }
        : { kind: 'participant', id: player.puuid },
      unit,
      window: null,
      denominator: denominator
        ? {
            value: denominator.observation.value,
            unit: denominator.unit,
            population: denominator.population,
          }
        : null,
      quality: metricQuality(validSamples, totalSamples),
      evidence: [...evidence.values()],
    });
  };
  const absolute = (
    id: string,
    unit: MetricUnit,
    observation: Observation,
    derived = false,
    teamSubject = false,
  ) => {
    const ctx = context(id, unit, observation, null, teamSubject);
    return observation.reason
      ? unavailableMetric(ctx, observation.reason)
      : metricValue(
          ctx,
          observation.value,
          derived ? 'derived' : 'observed',
          derived
            ? 'sum of complete named source observations'
            : 'direct persisted summary observation',
        );
  };
  const ratio = (
    id: string,
    unit: MetricUnit,
    numerator: Observation,
    denominator: Observation,
    denominatorUnit: string,
    population: string,
    scale: number,
    teamSubject = false,
  ): MetricResult => {
    const ctx = context(
      id,
      unit,
      numerator,
      { observation: denominator, unit: denominatorUnit, population },
      teamSubject,
    );
    const method = `numerator / denominator * ${scale}`;
    if (numerator.reason || denominator.reason)
      return unavailableMetric(
        ctx,
        numerator.reason ?? denominator.reason!,
        method,
      );
    if (denominator.value === 0)
      return unavailableMetric(ctx, 'zero_denominator', method);
    return metricValue(
      ctx,
      (numerator.value! / denominator.value!) * scale,
      'derived',
      method,
    );
  };
  const played = field(player, 'timePlayed');
  const measure = (
    id: string,
    name: string,
    unit: MetricUnit,
    perMinuteUnit: MetricUnit,
    read: (p: ContributionParticipant) => Observation = (p) => field(p, name),
  ): ContributionMeasure => {
    const own = read(player);
    return {
      absolute: absolute(id, unit, own, name === 'totalCs'),
      perMinute: ratio(
        id,
        perMinuteUnit,
        own,
        played,
        'seconds',
        `timePlayed of ${player.puuid}`,
        60,
      ),
      teamShare: ratio(
        id,
        'percent',
        own,
        teamSum(read),
        unit,
        `sum ${name} across the five participants of team ${player.teamId}`,
        100,
      ),
    };
  };
  const kpNumerator = sum([field(player, 'kills'), field(player, 'assists')]);
  const teamKills = teamSum((p) => field(p, 'kills'));
  const damage = measure(
    'C02',
    'totalDamageDealtToChampions',
    'damage',
    'damage_per_minute',
  );
  const gold = measure('E04', 'goldEarned', 'gold', 'gold_per_minute');
  const fromMetric = (metric: MetricResult): Observation => ({
    value: metric.value,
    reason: metric.reason,
    evidence: metric.evidence,
    quality: metric.quality,
  });
  const dead = field(player, 'totalTimeSpentDead');
  const teamDead = teamSum((p) => field(p, 'totalTimeSpentDead'));
  const teamPlayed = teamSum((p) => field(p, 'timePlayed'));
  const damageType = (type: string, taken = false) => {
    const name = `${type}Damage${taken ? 'Taken' : 'DealtToChampions'}`;
    const own = field(player, name);
    return {
      absolute: absolute('C03', 'damage', own),
      compositionPercent: ratio(
        'C03',
        'percent',
        own,
        field(
          player,
          taken ? 'totalDamageTaken' : 'totalDamageDealtToChampions',
        ),
        'damage',
        taken
          ? 'player total damage taken'
          : 'player total damage to champions',
        100,
      ),
    };
  };
  const teamGold = teamSum((p) => field(p, 'goldEarned'));
  const maxGold = teamGold.reason
    ? { ...teamGold }
    : {
        ...teamGold,
        value: Math.max(...team.map((p) => field(p, 'goldEarned').value!)),
      };
  const canonicalRole = normalizeRole(player.role);
  return {
    role: canonicalRole,
    roleExplanation:
      ROLE_EXPLANATIONS[canonicalRole ?? 'UNKNOWN'] ??
      ROLE_EXPLANATIONS.UNKNOWN,
    dimensions: {
      resources: {
        gold,
        cs: measure('E04', 'totalCs', 'cs', 'cs_per_minute', cs),
        teamGoldConcentration: ratio(
          'E04',
          'percent',
          maxGold,
          teamGold,
          'gold',
          `total gold of complete team ${player.teamId}`,
          100,
          true,
        ),
        largestGoldHolders:
          teamGold.value !== null && teamGold.value > 0
            ? team
                .filter((p) => field(p, 'goldEarned').value === maxGold.value)
                .map((p) => p.puuid)
                .sort()
            : [],
      },
      combat: {
        kills: absolute('C01', 'count', field(player, 'kills')),
        assists: absolute('C01', 'count', field(player, 'assists')),
        killParticipation: ratio(
          'C01',
          'percent',
          kpNumerator,
          teamKills,
          'count',
          `kills summed across the five participants of team ${player.teamId}`,
          100,
        ),
        damage,
        damageToGoldShareRatio: ratio(
          'C02',
          'ratio',
          fromMetric(damage.teamShare),
          fromMetric(gold.teamShare),
          'percent',
          'player share of team gold',
          1,
        ),
        damageDealtByType: {
          physical: damageType('physical'),
          magic: damageType('magic'),
          true: damageType('true'),
        },
        damageTaken: measure(
          'C03',
          'totalDamageTaken',
          'damage',
          'damage_per_minute',
        ),
        damageTakenByType: {
          physical: damageType('physical', true),
          magic: damageType('magic', true),
          true: damageType('true', true),
        },
        allyHealing: measure(
          'C04',
          'totalHealsOnTeammates',
          'health',
          'health_per_minute',
        ),
        allyShielding: measure(
          'C04',
          'totalDamageShieldedOnTeammates',
          'damage',
          'damage_per_minute',
        ),
        crowdControl: measure(
          'C05',
          'timeCCingOthers',
          'seconds',
          'seconds_per_minute',
        ),
        deadTime: absolute('C06', 'seconds', dead),
        deadTimePercent: ratio(
          'C06',
          'percent',
          dead,
          played,
          'seconds',
          `timePlayed of ${player.puuid}`,
          100,
        ),
        teamDeadTime: absolute('C06', 'player_seconds', teamDead, true, true),
        teamTimePlayed: absolute(
          'C06',
          'player_seconds',
          teamPlayed,
          true,
          true,
        ),
        teamDeadTimePercent: ratio(
          'C06',
          'percent',
          teamDead,
          teamPlayed,
          'player_seconds',
          `sum timePlayed across team ${player.teamId}`,
          100,
          true,
        ),
        interpretation:
          'Dano recebido descreve exposição ao combate; não mede sobrevivência nem qualidade. Tempo morto e shares precisam de contexto de campeão e papel.',
      },
      vision: {
        score: measure('V04', 'visionScore', 'score', 'score_per_minute'),
        wardsPlaced: measure('V04', 'wardsPlaced', 'count', 'count_per_minute'),
        wardsRemoved: measure(
          'V04',
          'wardsKilled',
          'count',
          'count_per_minute',
        ),
        interpretation:
          'Score, colocações e remoções são observações diferentes; estas participações não medem visão exata de uma região.',
      },
      structures: {
        turretDamage: measure(
          'O03',
          'damageDealtToTurrets',
          'damage',
          'damage_per_minute',
        ),
        turretKills: absolute('O03', 'count', field(player, 'turretKills')),
        turretTakedowns: absolute(
          'O03',
          'count',
          field(player, 'turretTakedowns'),
        ),
        interpretation:
          'Dano, último golpe e participação registrada em torres são dimensões distintas.',
      },
    },
  };
}
