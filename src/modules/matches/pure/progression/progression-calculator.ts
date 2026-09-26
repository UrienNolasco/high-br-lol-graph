import {
  MetricContext,
  MetricEvidence,
  MetricResult,
  metricContext,
  metricQuality,
  metricValue,
  unavailableMetric,
} from '../../contracts/metric-contract';
import { gameVersionPatch } from '../../contracts/eligibility';
import {
  ItemCatalog,
  unavailableItemCatalog,
} from '../../../../core/data-dragon/item-catalog';
import {
  SkillCatalog,
  unavailableSkillCatalog,
} from '../../../../core/data-dragon/skill-catalog';
import { readSnapshotProjection } from '../../../../core/riot/timeline-snapshots';
import { mapParticipantBuild, BuildParticipant } from '../builds.mapper';
import { buildItemLedger } from './item-ledger';
import {
  ProgressionEvent,
  eventId,
  ordered,
  record,
  time,
  integer,
  ITEM_EVENT_TYPES,
} from './types';
export interface ProgressionInput {
  matchId: string;
  gameVersion: string;
  queueId: number;
  mapId: number;
  gameDuration: number;
  participant: Omit<BuildParticipant, 'itemTimeline'>;
  events: ProgressionEvent[];
  snapshotProjection: unknown;
  processing: {
    status: string;
    processingVersion: number | null;
    completedAt: Date | null;
  } | null;
}
export function calculateProgression(
  input: ProgressionInput,
  itemCatalog: ItemCatalog,
  skillCatalog: SkillCatalog,
) {
  const compatible = (version: string | null, gameVersion: string) =>
    version !== null &&
    gameVersionPatch(input.gameVersion) !== null &&
    gameVersion === input.gameVersion &&
    gameVersionPatch(version) === gameVersionPatch(input.gameVersion);
  const items =
    itemCatalog.reason === null &&
    compatible(itemCatalog.version, itemCatalog.gameVersion)
      ? itemCatalog
      : unavailableItemCatalog(
          input.gameVersion,
          itemCatalog.reason ?? 'unsupported_version',
        );
  const skills =
    skillCatalog.reason === null &&
    skillCatalog.championId === input.participant.championId &&
    compatible(skillCatalog.version, skillCatalog.gameVersion)
      ? skillCatalog
      : unavailableSkillCatalog(
          input.gameVersion,
          input.participant.championId,
          skillCatalog.reason ?? 'unsupported_version',
        );
  const mapped = mapParticipantBuild(
    { ...input.participant, itemTimeline: [] },
    items,
  );
  const {
    finalBuild,
    roleBoundItem,
    inventorySource,
    inventoryVersion,
    inventoryReason,
    inventoryCoverage,
  } = mapped;
  const finalInventory = {
    finalBuild,
    roleBoundItem,
    inventorySource,
    inventoryVersion,
    inventoryReason,
    inventoryCoverage,
  };
  const unique = new Map<string, ProgressionEvent>();
  let duplicates = 0,
    conflict = false;
  for (const event of input.events) {
    const id = eventId(event),
      previous = unique.get(id);
    if (previous) {
      duplicates++;
      if (JSON.stringify(previous) !== JSON.stringify(event)) conflict = true;
    } else unique.set(id, event);
  }
  const events = ordered([...unique.values()]);
  const generation = input.processing?.processingVersion ?? null;
  const completion = input.processing?.completedAt;
  const processedAt =
    completion && Number.isFinite(completion.getTime())
      ? completion.toISOString()
      : null;
  const metadataKnown =
    input.processing?.status === 'COMPLETED' &&
    generation !== null &&
    generation >= 2 &&
    processedAt !== null;
  const consistent =
    metadataKnown &&
    events.every(
      (e) =>
        e.matchId === input.matchId &&
        e.processingVersion === generation &&
        e.metricVersion === 1,
    ) &&
    !conflict;
  const ends = events.filter(
    (e) =>
      e.type === 'GAME_END' &&
      time(e.timestampMs) &&
      [100, 200].includes(record(e.payload).winningTeam as number),
  );
  const endMs = ends.length
    ? Math.max(...ends.map((e) => e.timestampMs!))
    : null;
  const available = consistent && ends.length === 1;
  const reason = !metadataKnown
    ? 'missing_projection'
    : !consistent
      ? 'unsupported_or_conflicting_projection'
      : endMs === null
        ? 'missing_game_end'
        : ends.length !== 1
          ? 'ambiguous_game_end'
          : null;
  const own = events.filter((e) => e.actorPuuid === input.participant.puuid);
  const unknown = events.filter((e) => record(e.quality).unknownType === true);
  const unattributed = events.filter(
    (e) => e.actorPuuid === null && e.type !== 'GAME_END',
  );
  const serialize = (e: ProgressionEvent) => ({
    eventId: eventId(e),
    frameIndex: e.frameIndex,
    eventIndex: e.eventIndex,
    type: e.type,
    timestampMs: e.timestampMs,
    payload: e.payload,
    sourceQuality: e.quality,
  });
  const itemEvents = own.filter((e) => ITEM_EVENT_TYPES.includes(e.type ?? ''));
  const skillEvents = own.filter((e) => e.type === 'SKILL_LEVEL_UP');
  const common = {
    matchId: input.matchId,
    puuid: input.participant.puuid,
    championId: input.participant.championId,
    gameVersion: input.gameVersion,
    queueId: input.queueId,
    mapId: input.mapId,
    metricVersion: 1,
    processingVersion: generation,
    processedAt,
    source:
      'MatchEventProjection + MatchTimelineProjection + MatchParticipant.finalInventory',
    finalInventory,
    catalogs: {
      items: {
        gameVersion: items.gameVersion,
        version: items.version,
        reason: items.reason,
        policy: items.policy,
      },
      skills: {
        gameVersion: skills.gameVersion,
        version: skills.version,
        reason: skills.reason,
        policy: skills.policy,
        championId: skills.championId,
      },
    },
    quality: {
      available,
      reason,
      duplicateIdentities: duplicates,
      unknownEvents: unknown.length,
      unattributedEvents: unattributed.length,
    },
    originalItemEvents: itemEvents.map(serialize),
    originalSkillEvents: skillEvents.map(serialize),
    unattributedEvents: unattributed.map(serialize),
    interpretation:
      'Observed purchases and skill allocations; not authoritative inventory, build quality or skill effectiveness',
  };
  if (!available || endMs === null)
    return { ...common, trajectory: null, skillSequence: null };
  const evidence = (
    e: ProgressionEvent,
    field: string,
    value: MetricEvidence['value'],
  ): MetricEvidence => ({
    source: 'MatchEventProjection',
    field,
    value,
    eventId: eventId(e),
    frameIndex: e.frameIndex,
    ...(e.timestampMs !== null ? { timestampMs: e.timestampMs } : {}),
  });
  const context = (
    id: string,
    unit: MetricContext['unit'],
    validN: number,
    totalN: number,
    proof: MetricEvidence[],
  ): MetricContext =>
    metricContext({
      metricId: id,
      metricVersion: 1,
      processingVersion: generation,
      processedAt: processedAt,
      matchId: input.matchId,
      subject: { kind: 'participant', id: input.participant.puuid },
      unit,
      window: { startMs: 0, endMs: endMs, bounds: '[]' },
      denominator: null,
      quality: {
        ...metricQuality(validN, totalN),
        unknownEvents: unknown.length,
        reconciliationIssues: duplicates
          ? ['duplicate_identity_deduplicated']
          : [],
      },
      evidence: proof,
    });
  const ledger = buildItemLedger(
    itemEvents.map((e) =>
      e.timestampMs !== null && e.timestampMs > endMs
        ? { ...e, timestampMs: null }
        : e,
    ),
    items,
  );
  const itemTimings = [...new Set(ledger.acquisitions.map((a) => a.itemId))]
    .sort((a, b) => a - b)
    .map((id) => {
      const acquisitions = ledger.acquisitions.filter((a) => a.itemId === id),
        effective = acquisitions.filter((a) => a.effective === true),
        known = acquisitions.filter(
          (a) => a.effective !== null && time(a.timestampMs),
        );
      const proof = itemEvents
        .filter(
          (e) =>
            record(e.payload).itemId === id ||
            record(e.payload).beforeId === id ||
            record(e.payload).afterId === id,
        )
        .map((e) => evidence(e, 'itemId/beforeId/afterId', id));
      const c = context(
        'B02',
        'milliseconds',
        known.length,
        acquisitions.length,
        proof,
      );
      const firstEffectiveObservedAt: MetricResult = acquisitions.some(
        (a) => a.effective === null || !time(a.timestampMs),
      )
        ? unavailableMetric(
            c,
            'missing_field',
            'Ambiguous undo or missing purchase timestamp',
          )
        : effective.length
          ? metricValue(
              c,
              Math.min(...effective.map((a) => a.timestampMs!)),
              'derived',
              'First observed purchase not cancelled by a supported undo; does not imply currently held item',
            )
          : unavailableMetric(
              c,
              'not_calculated',
              'All observed purchases of this item were undone',
            );
      return {
        itemId: id,
        firstEffectiveObservedAt,
        effectivePurchaseCount: acquisitions.some((a) => a.effective === null)
          ? null
          : effective.length,
        metadata: items.items[String(id)] ?? null,
      };
    });
  const finalCounts = new Map<number, number>();
  for (const slot of finalBuild)
    if (slot.itemId != null && slot.itemId > 0)
      finalCounts.set(slot.itemId, (finalCounts.get(slot.itemId) ?? 0) + 1);
  const finalKnown = inventoryCoverage.validSlots === 7;
  const observedCounts = new Map(
    ledger.observedInventory.map((entry) => [entry.itemId, entry.quantity]),
  );
  const finalInventoryReconciliation = [
    ...new Set([...finalCounts.keys(), ...observedCounts.keys()]),
  ]
    .sort((a, b) => a - b)
    .map((id) => {
      const observedQuantity =
        observedCounts.get(id) ?? (ledger.stateComplete ? 0 : null);
      const finalSlotQuantity = finalKnown ? (finalCounts.get(id) ?? 0) : null;
      const excluded = roleBoundItem.itemId === id;
      return {
        itemId: id,
        observedQuantity,
        finalSlotQuantity,
        matches:
          excluded || observedQuantity === null || finalSlotQuantity === null
            ? null
            : observedQuantity === finalSlotQuantity,
        reason: excluded
          ? 'role_bound_slot_scope'
          : !finalKnown
            ? 'missing_final_slot'
            : observedQuantity === null
              ? 'ambiguous_trajectory'
              : null,
      };
    });
  const finalInventoryMismatch = finalInventoryReconciliation.some(
    (entry) => entry.matches === false,
  );
  const snapshots = readSnapshotProjection(input.snapshotProjection);
  const rankOrderKnown = skillEvents.every(
    (e) => time(e.timestampMs) && e.timestampMs <= endMs,
  );
  let previousEvent: ProgressionEvent | null = null;
  const ranks = new Map<number, number>();
  let previousTime: number | null = null;
  const skillSequence = skillEvents.map((e, index) => {
    const p = record(e.payload),
      slot = integer(p.skillSlot) && p.skillSlot > 0 ? p.skillSlot : null,
      type = typeof p.levelUpType === 'string' ? p.levelUpType : null;
    const timestamp =
      time(e.timestampMs) && e.timestampMs <= endMs ? e.timestampMs : null;
    const normal = type === 'NORMAL',
      spell = skills.spells.find((s) => s.slot === slot) ?? null;
    const rank =
      slot !== null && normal && rankOrderKnown
        ? (ranks.get(slot) ?? 0) + 1
        : null;
    if (rank !== null) ranks.set(slot!, rank);
    const validationReason =
      timestamp === null
        ? 'missing_or_invalid_timestamp'
        : slot === null
          ? 'invalid_skill_slot'
          : !normal
            ? 'unsupported_level_up_type'
            : !rankOrderKnown
              ? 'incomplete_allocation_order'
              : (skills.reason ??
                (!spell
                  ? 'unknown_skill_slot'
                  : spell.maxRank === null
                    ? 'missing_max_rank'
                    : rank! > spell.maxRank
                      ? 'rank_exceeds_catalog_max'
                      : null));
    const proof = [
      evidence(e, 'skillSlot', slot),
      evidence(e, 'levelUpType', type),
    ];
    const timing = context(
      'B04',
      'milliseconds',
      timestamp !== null ? 1 : 0,
      1,
      proof,
    );
    const allocationAt = metricValue(
      timing,
      timestamp,
      'observed',
      'Timestamp of observed SKILL_LEVEL_UP allocation, not ability use',
    );
    const intervalContext = context(
      'B04',
      'milliseconds',
      timestamp !== null && previousTime !== null ? 1 : 0,
      1,
      previousEvent
        ? [
            ...proof,
            evidence(previousEvent, 'timestamp', previousEvent.timestampMs),
          ]
        : proof,
    );
    const sincePreviousAllocation =
      timestamp !== null && previousTime !== null
        ? metricValue(
            intervalContext,
            timestamp - previousTime,
            'derived',
            'Elapsed time since preceding observed skill allocation; not delay after an available skill point',
          )
        : unavailableMetric(intervalContext, 'missing_field');
    const previousSnapshot =
      timestamp === null
        ? null
        : ((snapshots?.frames ?? [])
            .filter(
              (f) =>
                time(f.timestamp) &&
                f.timestamp <= timestamp &&
                timestamp - f.timestamp <= 60000,
            )
            .sort(
              (a, b) =>
                b.timestamp! - a.timestamp! || b.frameIndex - a.frameIndex,
            )
            .find((f) =>
              Object.values(f.participantFrames).some(
                (s) => s.puuid === input.participant.puuid,
              ),
            ) ?? null);
    const observedLevel = previousSnapshot
      ? (Object.values(previousSnapshot.participantFrames).find(
          (s) => s.puuid === input.participant.puuid,
        )?.level ?? null)
      : null;
    previousTime = timestamp;
    previousEvent = e;
    return {
      eventId: eventId(e),
      ordinal: index + 1,
      timestampMs: e.timestampMs,
      skillSlot: slot,
      levelUpType: type,
      observedNormalRank: rank,
      metadata: spell,
      allocationAt,
      sincePreviousAllocation,
      validation: {
        status:
          validationReason === null
            ? 'catalog_consistent'
            : 'unavailable_or_invalid',
        reason: validationReason,
        version: skills.version,
        scope:
          'slot_and_max_rank_only; no level-unlock, evolution or efficacy inference',
      },
      levelContext: previousSnapshot
        ? {
            level: observedLevel,
            frameIndex: previousSnapshot.frameIndex,
            timestampMs: previousSnapshot.timestamp,
            offsetMs: previousSnapshot.timestamp! - timestamp!,
            reason: observedLevel === null ? 'missing_field' : null,
          }
        : {
            level: null,
            frameIndex: null,
            timestampMs: null,
            offsetMs: null,
            reason: 'missing_frame',
          },
    };
  });
  return {
    ...common,
    trajectory: {
      ...ledger,
      itemTimings,
      finalInventoryReconciliation,
      window: { startMs: 0, endMs, bounds: '[]' },
      stateComplete:
        ledger.stateComplete &&
        !finalInventoryMismatch &&
        unattributed.length === 0 &&
        unknown.length === 0,
    },
    skillSequence,
  };
}
