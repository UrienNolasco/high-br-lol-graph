import type {
  MatchReviewContext,
  ReviewKill,
  ReviewParticipant,
} from '../../contracts/match-review';
import type { MetricEvidence } from '../../contracts/metric-contract';
import { reviewRecord, reviewNumber } from './review-context';

export const DEATH_RECAP_REVIEW_VERSION = 1;
export interface RecapDamageBreakdown {
  physical: number | null;
  magic: number | null;
  true: number | null;
  total: number | null;
}
export interface RecapPartialDamage extends RecapDamageBreakdown {
  knownPhysicalComponents: number;
  knownMagicComponents: number;
  knownTrueComponents: number;
}
export interface DeathRecapEntry {
  entryIndex: number;
  participantId: number | null;
  name: string | null;
  type: string | null;
  spellName: string | null;
  classification: 'participant' | 'non_participant_unit' | 'unattributed';
  sourcePuuid: string | null;
  damage: RecapDamageBreakdown;
  issues: string[];
  evidence: MetricEvidence[];
}
export interface DeathRecapSource {
  participantId: number;
  puuid: string;
  championName: string;
  entryIndices: number[];
  damage: RecapDamageBreakdown;
  partialDamage: RecapPartialDamage;
}
export interface DeathReceivedRecap {
  eventId: string;
  frameIndex: number;
  eventIndex: number;
  timestampMs: number;
  sourceMaxTimestampMs: number;
  windowDurationMs: null;
  windowReason: 'source_window_not_observed';
  origin: 'derived';
  listState: 'absent' | 'invalid' | 'empty' | 'observed';
  available: boolean;
  reason: string | null;
  quality: {
    entryCount: number | null;
    validEntries: number;
    issues: string[];
  };
  listedDamage: RecapDamageBreakdown;
  partialListedDamage: RecapPartialDamage;
  nonParticipantUnitDamage: RecapDamageBreakdown;
  partialNonParticipantUnitDamage: RecapPartialDamage;
  partialUnattributedDamage: RecapPartialDamage;
  entries: DeathRecapEntry[];
  sources: DeathRecapSource[];
  sourcesComplete: boolean;
  sourceCount: number | null;
  championListedDamageDenominator: number | null;
  largestSourceShare: number | null;
  baselineComparable: boolean;
  baselineReason: string | null;
  baselineSourceIds: number[] | null;
  additionalSourceIds: number[] | null;
  baselineAbsentFromPositiveRecap: number[] | null;
  evidence: MetricEvidence[];
}
export interface DeathRecapReview {
  definitionVersion: number;
  available: boolean;
  reason: string | null;
  processedAt: string | null;
  processingVersion: number | null;
  coverage: {
    observedDeaths: number | null;
    expectedDeaths: number | null;
    recapsWithObservedList: number | null;
    availableRecaps: number | null;
  };
  deaths: DeathReceivedRecap[];
}

const record = reviewRecord;
const number = (value: unknown): number | null =>
  reviewNumber(value) ? value : null;
const id = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const sum = (values: (number | null)[]): number | null =>
  values.some((value) => value === null)
    ? null
    : number(values.reduce<number>((total, value) => total + value!, 0));
const unknownDamage = (): RecapDamageBreakdown => ({
  physical: null,
  magic: null,
  true: null,
  total: null,
});
const damage = (raw: Record<string, unknown>): RecapDamageBreakdown => {
  const physical = number(raw.physicalDamage);
  const magic = number(raw.magicDamage);
  const trueDamage = number(raw.trueDamage);
  return {
    physical,
    magic,
    true: trueDamage,
    total: sum([physical, magic, trueDamage]),
  };
};
function aggregate(rows: RecapDamageBreakdown[]): RecapDamageBreakdown {
  const physical = sum(rows.map((row) => row.physical));
  const magic = sum(rows.map((row) => row.magic));
  const trueDamage = sum(rows.map((row) => row.true));
  return {
    physical,
    magic,
    true: trueDamage,
    total: sum([physical, magic, trueDamage]),
  };
}
function partial(rows: RecapDamageBreakdown[]): RecapPartialDamage {
  const known = (key: 'physical' | 'magic' | 'true') =>
    rows
      .map((row) => row[key])
      .filter((value): value is number => value !== null);
  const physical = known('physical'),
    magic = known('magic'),
    trueDamage = known('true');
  const p = sum(physical),
    m = sum(magic),
    t = sum(trueDamage);
  return {
    physical: p,
    magic: m,
    true: t,
    total: sum([p, m, t]),
    knownPhysicalComponents: physical.length,
    knownMagicComponents: magic.length,
    knownTrueComponents: trueDamage.length,
  };
}
const sourceEvidence = (
  kill: ReviewKill,
  field: string,
  value: MetricEvidence['value'] = null,
): MetricEvidence => ({
  source: 'MatchEventProjection',
  field,
  value,
  eventId: kill.eventId,
  frameIndex: kill.frameIndex,
  timestampMs: kill.timestampMs,
});

function receivedRecap(
  context: MatchReviewContext,
  kill: ReviewKill,
  victim: ReviewParticipant,
): DeathReceivedRecap {
  const roster = new Map(context.input.participants.map((p) => [p.puuid, p]));
  const resolve = (rawId: unknown): ReviewParticipant | null => {
    if (!id(rawId) || rawId === 0) return null;
    const puuid = context.participantIds.get(rawId);
    return puuid ? (roster.get(puuid) ?? null) : null;
  };
  const rawList = kill.payload.victimDamageReceived;
  const listState = !Object.hasOwn(kill.payload, 'victimDamageReceived')
    ? 'absent'
    : !Array.isArray(rawList)
      ? 'invalid'
      : rawList.length
        ? 'observed'
        : 'empty';
  const rows: unknown[] = Array.isArray(rawList) ? rawList : [];
  const entries = rows.map((raw, entryIndex): DeathRecapEntry => {
    const row = record(raw),
      values = damage(row),
      issues: string[] = [];
    const participantId = id(row.participantId) ? row.participantId : null;
    let classification: DeathRecapEntry['classification'] = 'unattributed';
    let sourcePuuid: string | null = null;
    if (values.total === null) issues.push('invalid_or_missing_damage');
    if (participantId === null) issues.push('invalid_participant_id');
    else if (participantId === 0) {
      if (
        row.type === 'MINION' ||
        row.type === 'MONSTER' ||
        row.type === 'TOWER'
      )
        classification = 'non_participant_unit';
      else issues.push('unattributed_zero_id');
    } else {
      const source = resolve(participantId);
      if (!source) issues.push('unresolved_participant_id');
      else if (
        typeof row.name !== 'string' ||
        !row.name ||
        row.name !== source.championName
      )
        issues.push('id_name_conflict');
      else if (
        ![100, 200].includes(source.teamId) ||
        ![100, 200].includes(victim.teamId)
      )
        issues.push('invalid_team');
      else if (source.teamId === victim.teamId) issues.push('same_team_source');
      else {
        classification = 'participant';
        sourcePuuid = source.puuid;
      }
    }
    return {
      entryIndex,
      participantId,
      name: typeof row.name === 'string' ? row.name : null,
      type: typeof row.type === 'string' ? row.type : null,
      spellName: typeof row.spellName === 'string' ? row.spellName : null,
      classification,
      sourcePuuid,
      damage: values,
      issues,
      evidence: [
        'physicalDamage',
        'magicDamage',
        'trueDamage',
        'participantId',
        'name',
        'type',
      ].map((field) =>
        sourceEvidence(
          kill,
          `payload.victimDamageReceived[${entryIndex}].${field}`,
          typeof row[field] === 'string' ? row[field] : number(row[field]),
        ),
      ),
    };
  });
  const issues = [...new Set(entries.flatMap((entry) => entry.issues))];
  const grouped = new Map<number, DeathRecapEntry[]>();
  for (const entry of entries)
    if (entry.classification === 'participant') {
      grouped.set(entry.participantId!, [
        ...(grouped.get(entry.participantId!) ?? []),
        entry,
      ]);
    }
  const sources: DeathRecapSource[] = [...grouped]
    .sort(([a], [b]) => a - b)
    .map(([participantId, group]) => {
      const participant = resolve(participantId)!;
      return {
        participantId,
        puuid: participant.puuid,
        championName: participant.championName,
        entryIndices: group.map((entry) => entry.entryIndex),
        damage: aggregate(group.map((entry) => entry.damage)),
        partialDamage: partial(group.map((entry) => entry.damage)),
      };
    });
  const listedDamage = aggregate(entries.map((entry) => entry.damage));
  if (
    entries.every((entry) => entry.damage.total !== null) &&
    listedDamage.total === null
  )
    issues.push('damage_sum_overflow');
  const complete = listState === 'observed' && issues.length === 0;
  const validPositiveSources = sources.filter(
    (source) => source.damage.total !== null && source.damage.total > 0,
  );
  const championDenominator = complete
    ? sum(sources.map((source) => source.damage.total))
    : null;
  const rawAssists = kill.payload.assistingParticipantIds,
    killerId = kill.payload.killerId;
  const killer = resolve(killerId);
  const killerValid =
    killerId === 0
      ? kill.killerPuuid === null
      : killer !== null &&
        killer.puuid === kill.killerPuuid &&
        [100, 200].includes(killer.teamId) &&
        killer.teamId !== victim.teamId;
  const baselineComparable =
    kill.assistanceComplete &&
    killerValid &&
    Array.isArray(rawAssists) &&
    rawAssists.every(
      (rawId) =>
        id(rawId) &&
        rawId > 0 &&
        [100, 200].includes(resolve(rawId)?.teamId ?? 0) &&
        resolve(rawId)?.teamId !== victim.teamId,
    ) &&
    new Set(rawAssists).size === rawAssists.length &&
    !rawAssists.includes(killerId) &&
    new Set(rawAssists.map((rawId) => resolve(rawId)!.puuid)).size ===
      rawAssists.length &&
    rawAssists.length === kill.assistingPuuids.length &&
    rawAssists.every((rawId) =>
      kill.assistingPuuids.includes(resolve(rawId)!.puuid),
    );
  const baselineIds = baselineComparable
    ? [
        ...new Set([
          ...(killerId === 0 ? [] : [killerId as number]),
          ...(rawAssists as number[]),
        ]),
      ].sort((a, b) => a - b)
    : null;
  const positiveIds = validPositiveSources.map(
    (source) => source.participantId,
  );
  const rowDamage = entries.map((entry) => entry.damage);
  const unitDamage = entries
    .filter((entry) => entry.classification === 'non_participant_unit')
    .map((entry) => entry.damage);
  return {
    eventId: kill.eventId,
    frameIndex: kill.frameIndex,
    eventIndex: kill.eventIndex,
    timestampMs: kill.timestampMs,
    sourceMaxTimestampMs: kill.timestampMs,
    windowDurationMs: null,
    windowReason: 'source_window_not_observed',
    origin: 'derived',
    listState,
    available: complete,
    reason: complete
      ? null
      : listState === 'observed'
        ? 'invalid_entries'
        : `${listState}_recap`,
    quality: {
      entryCount: Array.isArray(rawList) ? rawList.length : null,
      validEntries: entries.filter((entry) => entry.issues.length === 0).length,
      issues,
    },
    listedDamage: Array.isArray(rawList) ? listedDamage : unknownDamage(),
    partialListedDamage: partial(rowDamage),
    nonParticipantUnitDamage: complete
      ? aggregate(unitDamage)
      : unknownDamage(),
    partialNonParticipantUnitDamage: partial(unitDamage),
    partialUnattributedDamage: partial(
      entries
        .filter((entry) => entry.classification === 'unattributed')
        .map((entry) => entry.damage),
    ),
    entries,
    sources,
    sourcesComplete: complete,
    sourceCount: complete ? validPositiveSources.length : null,
    championListedDamageDenominator: championDenominator,
    largestSourceShare:
      championDenominator !== null && championDenominator > 0
        ? Math.max(
            ...validPositiveSources.map((source) => source.damage.total!),
          ) / championDenominator
        : null,
    baselineComparable,
    baselineReason: baselineComparable
      ? null
      : 'unknown_or_invalid_assistance_baseline',
    baselineSourceIds: baselineIds,
    additionalSourceIds:
      complete && baselineIds
        ? positiveIds.filter((pid) => !baselineIds.includes(pid))
        : null,
    baselineAbsentFromPositiveRecap:
      complete && baselineIds
        ? baselineIds.filter((pid) => !positiveIds.includes(pid))
        : null,
    evidence: [
      sourceEvidence(kill, 'payload.victimDamageReceived'),
      sourceEvidence(kill, 'payload.assistingParticipantIds'),
      sourceEvidence(kill, 'payload.killerId', id(killerId) ? killerId : null),
    ],
  };
}

/** Descriptive evidence per death. Recaps are never summed into fight/player damage. */
export function calculateDeathRecapReview(
  context: MatchReviewContext,
  puuid: string,
): DeathRecapReview {
  const participant = context.input.participants.find((p) => p.puuid === puuid);
  const reason =
    context.sourceReason ??
    context.combatReason ??
    (!participant ? 'unknown_participant' : null);
  const deaths =
    reason || !participant
      ? []
      : context.kills
          .filter((kill) => kill.victimPuuid === puuid)
          .map((kill) => receivedRecap(context, kill, participant));
  return {
    definitionVersion: DEATH_RECAP_REVIEW_VERSION,
    available: reason === null,
    reason,
    processedAt: context.processedAt,
    processingVersion: context.processingVersion,
    coverage: {
      observedDeaths: reason ? null : deaths.length,
      expectedDeaths: participant ? number(participant.deaths) : null,
      recapsWithObservedList: reason
        ? null
        : deaths.filter(
            (death) =>
              death.listState === 'observed' || death.listState === 'empty',
          ).length,
      availableRecaps: reason
        ? null
        : deaths.filter((death) => death.available).length,
    },
    deaths,
  };
}
