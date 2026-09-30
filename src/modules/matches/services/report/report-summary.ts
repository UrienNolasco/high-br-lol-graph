import { normalizeRole } from '../../contracts/eligibility';
import { metricQuality } from '../../contracts/metric-contract';
import {
  ReportInput,
  ReportOptions,
  record,
  sourceKnown,
  sourceTime,
  isFiniteNumber,
} from './report.types';
import {
  REPORT_FAMILIES,
  REPORT_SECTIONS,
} from '../../contracts/calculations/report';
import { ReportCatalogs, reportFamilies } from './report-families';
import { reportBase, reportMetric, selectPath } from './report-navigation';
const DIMENSIONS: readonly {
  id: string;
  label: string;
  metrics: readonly (readonly [string, string])[];
}[] = [
  {
    id: 'resources',
    label: 'Recursos',
    metrics: [
      ['Ouro do time', 'gold.teamShare'],
      ['Ouro obtido', 'gold.absolute'],
      ['CS por minuto', 'cs.perMinute'],
    ],
  },
  {
    id: 'combat',
    label: 'Combate',
    metrics: [
      ['Dano a campeões do time', 'damage.teamShare'],
      ['Cura em aliados', 'allyHealing.absolute'],
      ['Escudos em aliados', 'allyShielding.absolute'],
      ['Controle de grupo', 'crowdControl.absolute'],
      ['Participação em abates', 'killParticipation'],
    ],
  },
  {
    id: 'vision',
    label: 'Visão',
    metrics: [
      ['Wards colocadas', 'wardsPlaced.absolute'],
      ['Wards removidas', 'wardsRemoved.absolute'],
      ['Pontuação de visão', 'score.absolute'],
    ],
  },
  {
    id: 'structures',
    label: 'Estruturas',
    metrics: [
      ['Dano a torres do time', 'turretDamage.teamShare'],
      ['Participações em torres', 'turretTakedowns'],
    ],
  },
] as const;
const TOTAL_FIELDS = {
  goldEarned: ['E04', 'gold', 'Ouro obtido'],
  totalDamageDealtToChampions: ['C02', 'damage', 'Dano a campeões'],
  totalHealsOnTeammates: ['C04', 'health', 'Cura em aliados'],
  totalDamageShieldedOnTeammates: ['C04', 'damage', 'Escudos em aliados'],
  wardsPlaced: ['V04', 'count', 'Wards colocadas'],
  wardsKilled: ['V04', 'count', 'Wards removidas'],
  visionScore: ['V04', 'score', 'Pontuação de visão'],
  damageDealtToTurrets: ['O03', 'damage', 'Dano a torres'],
  kills: ['C01', 'count', 'Abates'],
  deaths: ['C09', 'count', 'Mortes'],
  assists: ['C01', 'count', 'Assistências'],
  timePlayed: ['E04', 'seconds', 'Tempo jogado'],
} as const;
export function observedReportTotals(input: ReportInput, puuid: string) {
  const player = input.participants.find((p) => p.puuid === puuid)!,
    projection = record(player.finalStats),
    values = record(projection.values);
  const version = sourceKnown(input)
      ? input.processing!.processingVersion
      : null,
    processedAt = sourceKnown(input) ? sourceTime(input) : null;
  return Object.fromEntries(
    Object.entries(TOTAL_FIELDS).map(([field, [metricId, unit, label]]) => {
      const core = ['kills', 'deaths', 'assists'].includes(field),
        raw = core ? record(player)[field] : values[field];
      const reason =
        !core && projection.projectionVersion !== 1
          ? player.finalStats == null
            ? 'missing_projection'
            : 'unsupported_version'
          : !isFiniteNumber(raw) || raw < 0
            ? raw == null
              ? 'missing_field'
              : 'invalid_value'
            : null;
      const value = reason ? null : (raw as number);
      return [
        field,
        {
          label,
          metricId,
          metricVersion: 1,
          processingVersion: version,
          processedAt,
          matchId: input.matchId,
          subject: { kind: 'participant', id: puuid },
          unit,
          window: null,
          denominator: null,
          quality: metricQuality(value === null ? 0 : 1, 1),
          value,
          origin: value === null ? 'unavailable' : 'observed',
          reason,
          method:
            'Literal persisted final summary field; processing provenance may be unknown',
          evidence: [
            {
              source: 'MatchParticipant',
              field: `${puuid}.${core ? field : `finalStats.values.${field}`}`,
              value,
            },
          ],
        },
      ];
    }),
  );
}
export function reportSourceAvailability(input: ReportInput) {
  const version = input.processing?.processingVersion ?? null;
  const processingReason = !sourceKnown(input)
    ? version !== null && version < 2
      ? 'unsupported_processing_version'
      : 'missing_processing_metadata'
    : null;
  const rows = input.events,
    ends = rows.filter(
      (e) =>
        e.type === 'GAME_END' &&
        isFiniteNumber(e.timestampMs) &&
        [100, 200].includes(Number(record(e.payload).winningTeam)),
    );
  const eventsReason =
    processingReason ??
    (input.readLimits.eventsTruncated
      ? 'event_read_limit_exceeded'
      : rows.some(
            (e) => e.metricVersion !== 1 || e.processingVersion !== version,
          )
        ? 'unsupported_event_projection'
        : !rows.length
          ? 'missing_event_projection'
          : ends.length !== 1
            ? 'missing_or_ambiguous_game_end'
            : null);
  const projection = record(input.timelineProjection);
  const framesReason =
    processingReason ??
    (input.readLimits.framesTruncated
      ? 'frame_read_limit_exceeded'
      : !input.timelineProjection
        ? 'missing_snapshot_projection'
        : projection.projectionVersion !== 1
          ? 'unsupported_snapshot_projection'
          : !Array.isArray(projection.frames) || !projection.frames.length
            ? 'missing_frames'
            : null);
  return { processingReason, eventsReason, framesReason };
}
export function buildReportSummary(
  input: ReportInput,
  puuid: string,
  options: ReportOptions,
  catalogs: ReportCatalogs,
) {
  const ctx = reportFamilies(input, puuid, options, catalogs),
    base = reportBase(input.matchId, puuid),
    contribution = ctx.calculate('contribution'),
    availability = reportSourceAvailability(input);
  const dimensions = DIMENSIONS.map((d) => ({
    id: d.id,
    label: d.label,
    presentationWeight: 1,
    reason: contribution.reason,
    metrics: d.metrics.map(([label, key]) => {
      const path = [d.id, ...key.split('.')];
      const metric = contribution.sections[d.id]
        ? selectPath(contribution.sections, path)
        : null;
      return metric
        ? {
            label,
            ...reportMetric(
              metric,
              'contribution',
              path,
              contribution,
              base,
              options.evidenceLimit,
              options.mode,
            ),
          }
        : {
            label,
            key: `${d.id}.${key}`,
            metricId:
              d.id === 'resources'
                ? key.startsWith('cs')
                  ? 'E02'
                  : 'E04'
                : d.id === 'vision'
                  ? 'V04'
                  : d.id === 'structures'
                    ? 'O03'
                    : key === 'killParticipation'
                      ? 'C01'
                      : key.startsWith('ally')
                        ? 'C04'
                        : key.startsWith('crowd')
                          ? 'C05'
                          : 'C02',
            window: null,
            denominator: null,
            value: null,
            unit:
              key.endsWith('teamShare') || key === 'killParticipation'
                ? 'percent'
                : key.endsWith('perMinute')
                  ? 'cs_per_minute'
                  : key.startsWith('gold')
                    ? 'gold'
                    : key.startsWith('damage') ||
                        key.startsWith('allyShielding')
                      ? 'damage'
                      : key.startsWith('allyHealing')
                        ? 'health'
                        : key.startsWith('crowdControl')
                          ? 'seconds'
                          : key.startsWith('score')
                            ? 'score'
                            : 'count',
            metricVersion: 1,
            processingVersion: null,
            processedAt: null,
            origin: 'unavailable',
            reason: contribution.reason,
            quality: metricQuality(0, 1),
            evidence: {
              items: [],
              total: 0,
              offset: 0,
              limit: options.evidenceLimit,
              hasMore: false,
              next: null,
            },
            href: null,
          };
    }),
  }));
  const totals = observedReportTotals(input, puuid);
  const finalTotals = Object.entries(totals).map(([key, value]) =>
    reportMetric(
      value,
      'totals',
      [key],
      {
        metricVersion: 1,
        processingVersion: sourceKnown(input)
          ? input.processing!.processingVersion
          : null,
        processedAt: sourceKnown(input) ? sourceTime(input) : null,
      },
      base,
      options.evidenceLimit,
      options.mode,
    ),
  );
  const families = REPORT_FAMILIES.map((family) => {
    const reason =
      family === 'contribution'
        ? availability.processingReason
        : family === 'economy'
          ? availability.framesReason
          : availability.eventsReason;
    return {
      family,
      dataAvailable: reason === null,
      reason,
      sections: REPORT_SECTIONS[family].map((section) => ({
        id: section,
        href: `${base}/families/${family}?section=${section}&limit=${options.limit}&evidenceLimit=${options.evidenceLimit}&mode=${options.mode}`,
      })),
      ...(family === 'progression'
        ? {
            catalogs: {
              items: catalogs.items.reason,
              skills: catalogs.skills.reason,
            },
          }
        : {}),
    };
  });
  const participant = ctx.player;
  const validFinal = finalTotals.filter((m) => m.value !== null).length;
  return {
    schemaVersion: 1,
    matchId: input.matchId,
    participant: {
      puuid,
      riotId:
        participant.riotIdGameName && participant.riotIdTagline
          ? `${participant.riotIdGameName}#${participant.riotIdTagline}`
          : null,
      championId: participant.championId,
      champion: participant.championName,
      role: normalizeRole(participant.role),
      teamId: participant.teamId,
    },
    context: {
      queueId: input.queueId,
      mapId: input.mapId,
      gameVersion: input.gameVersion,
      gameCreationMs: input.gameCreation.toString(),
      gameDurationSeconds: input.gameDuration,
      win: participant.win,
      region: null,
      regionReason: 'not_recorded_in_match_projection',
      historicalReference: null,
      historicalReferenceReason: 'insufficient_sample',
    },
    provenance: {
      processingVersion: sourceKnown(input)
        ? input.processing!.processingVersion
        : null,
      processedAt: sourceKnown(input) ? sourceTime(input) : null,
      known: sourceKnown(input),
      reason: availability.processingReason,
    },
    availability: {
      status:
        validFinal === 0
          ? 'unavailable'
          : families.some((f) => !f.dataAvailable) ||
              dimensions.some((d) => d.metrics.some((m) => m.value === null))
            ? 'partial'
            : 'available',
      finalTotals: { validN: validFinal, totalN: finalTotals.length },
      ...availability,
    },
    dimensions,
    finalTotals,
    families,
    roleExplanation: contribution.metadata.roleExplanation,
    episodes: {
      href: `${base}/episodes?limit=${options.limit}&evidenceLimit=${options.evidenceLimit}`,
      reason: availability.eventsReason,
    },
    readLimits: input.readLimits,
    payloadPolicy: {
      defaultCollectionLimit: options.limit,
      nestedPreviewLimit: Math.min(3, options.limit),
      evidencePreviewLimit: options.evidenceLimit,
      maximumPageSize: 50,
      filtersAffect:
        'presentation_only; metric denominators and calculation windows are unchanged',
    },
    interpretation:
      'Quatro dimensões equivalentes; sem nota geral, causalidade ou referência histórica presumida.',
  };
}
