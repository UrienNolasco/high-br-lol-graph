import {
  buildItemLedger,
  ProgressionEvent,
} from '../../matches/contracts/calculations/item-ledger';
import {
  gameVersionPatch,
  normalizeRole,
  selectUniqueOpponent,
} from '../../matches/contracts/eligibility';
import type {
  BuildChoiceFilters,
  BuildChoiceCohort,
  BuildChoiceParticipant,
} from '../../matches/ports/build-choice-reader';
import type { ChoiceCatalog } from '../../matches/contracts/choice-catalog';
import type { ItemCatalog } from '../../matches/contracts/catalogs';
import { selectCheckpoint } from '../../matches/contracts/temporal';

export const BUILD_CHOICE_METHOD_VERSION = 1;
const object = (v: unknown): Record<string, any> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const positiveId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export function normalizeBuildChoiceFilters(
  raw: Record<string, unknown>,
): BuildChoiceFilters {
  const allowed = [
    'patch',
    'championId',
    'role',
    'checkpointMs',
    'opponentChampionId',
    'queueId',
    'fromMs',
    'toMs',
    'limit',
  ];
  if (Object.keys(raw).some((k) => !allowed.includes(k)))
    throw new Error('Unknown build choice filter');
  const integer = (key: string, fallback?: number) => {
    const v = raw[key] ?? fallback;
    const n =
      typeof v === 'number'
        ? v
        : typeof v === 'string' && /^\d+$/.test(v)
          ? Number(v)
          : NaN;
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid ${key}`);
    return n;
  };
  if (typeof raw.patch !== 'string' || !/^\d+\.\d+$/.test(raw.patch))
    throw new Error('Exact patch required');
  const role = typeof raw.role === 'string' ? normalizeRole(raw.role) : null;
  if (!role) throw new Error('Known role required');
  const f: BuildChoiceFilters = {
    patch: raw.patch.split('.').map(Number).join('.'),
    role,
    championId: integer('championId'),
    checkpointMs: integer('checkpointMs', 900000),
    queueId: integer('queueId', 420),
    limit: integer('limit', 500),
  };
  if (
    !positiveId(f.championId) ||
    !positiveId(f.queueId) ||
    f.limit < 1 ||
    f.limit > 500 ||
    f.checkpointMs < 60000 ||
    f.checkpointMs > 3600000
  )
    throw new Error(
      'Invalid cohort or checkpoint (60000..3600000), limit (1..500)',
    );
  for (const k of ['opponentChampionId', 'fromMs', 'toMs'] as const)
    if (raw[k] !== undefined) f[k] = integer(k);
  if (f.opponentChampionId !== undefined && !positiveId(f.opponentChampionId))
    throw new Error('Invalid opponentChampionId');
  if (f.fromMs !== undefined && f.toMs !== undefined && f.fromMs >= f.toMs)
    throw new Error('Period must be [fromMs,toMs)');
  return f;
}
export interface BuildChoiceCatalogBundle {
  items: ItemCatalog;
  choices: ChoiceCatalog;
}
interface ItemObservation {
  id: number;
  acquisitionMs: number;
  eventId: string;
  goldBeforeAcquisition: number | null;
  currentGoldBeforeAcquisition: number | null;
  acquisitionFrameTimestampMs: number | null;
}
interface Observation {
  matchId: string;
  puuid: string;
  win: boolean;
  opponentChampionId: number;
  totalGold: number;
  currentGold: number;
  frameTimestampMs: number;
  goldBin: number;
  itemAvailable: boolean;
  items: ItemObservation[];
  runeIds: number[] | null;
  runeKey: string | null;
  spellIds: number[] | null;
  catalogs: BuildChoiceCatalogBundle;
  processingVersion: number;
  processedAt: string;
}
/** Nominal Wilson score interval, fixed95%; repeated players and selection violate independence. */
function outcome(rows: Observation[]) {
  const n = rows.length,
    wins = rows.filter((r) => r.win).length;
  if (!n)
    return {
      n: 0,
      players: 0,
      wins: 0,
      winRate: null,
      interval95: null,
      sufficient: false,
    };
  const z = 1.959963984540054,
    p = wins / n,
    d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d,
    half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return {
    n,
    players: new Set(rows.map((r) => r.puuid)).size,
    wins,
    winRate: p,
    interval95: {
      lower: Math.max(0, center - half),
      upper: Math.min(1, center + half),
    },
    sufficient: n >= 30,
  };
}
function mean(values: number[]) {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}
function runes(p: BuildChoiceParticipant, catalog: ChoiceCatalog) {
  const styles = object(p.runes).styles;
  if (!Array.isArray(styles) || styles.length !== 2) return null;
  const primary = styles.find((s) => object(s).description === 'primaryStyle');
  const secondary = styles.find((s) => object(s).description === 'subStyle');
  if (!primary || !secondary || primary.style === secondary.style) return null;
  const a = catalog.styles[String(primary.style)],
    b = catalog.styles[String(secondary.style)];
  if (
    !a ||
    !b ||
    !Array.isArray(primary.selections) ||
    !Array.isArray(secondary.selections) ||
    primary.selections.length !== 4 ||
    secondary.selections.length !== 2
  )
    return null;
  const first = primary.selections.map((s) => object(s).perk),
    second = secondary.selections.map((s) => object(s).perk);
  if (
    !first.every((id, i) => positiveId(id) && a.slots[i].includes(id)) ||
    new Set(second).size !== 2 ||
    !second.every(
      (id) =>
        positiveId(id) && b.slots.slice(1).some((slot) => slot.includes(id)),
    ) ||
    b.slots.slice(1).filter((slot) => second.some((id) => slot.includes(id)))
      .length !== 2
  )
    return null;
  const shards = object(object(p.runes).statPerks);
  const shardIds = [shards.offense, shards.flex, shards.defense];
  if (!shardIds.every(positiveId)) return null;
  const ids = [
    primary.style,
    secondary.style,
    ...first,
    ...second.sort((a, b) => a - b),
    ...shardIds,
  ];
  return { ids, key: `${primary.style}/${secondary.style}:${ids.join(',')}` };
}
const itemTypes = [
  'ITEM_PURCHASED',
  'ITEM_SOLD',
  'ITEM_DESTROYED',
  'ITEM_UNDO',
];
export function calculateBuildChoices(
  cohort: BuildChoiceCohort,
  f: BuildChoiceFilters,
  catalogs: Record<string, BuildChoiceCatalogBundle>,
) {
  const exclusions: Record<string, number> = {};
  const missingness: Record<string, number> = {};
  const add = (target: Record<string, number>, reason: string) =>
    (target[reason] = (target[reason] ?? 0) + 1);
  const rows: Observation[] = [],
    seen = new Set<string>();
  for (const m of cohort.matches) {
    if (seen.has(m.matchId)) {
      add(exclusions, 'duplicate_match');
      continue;
    }
    seen.add(m.matchId);
    const exclude = (reason: string) => add(exclusions, reason);
    if (m.populationEligible !== true) {
      exclude('population_not_eligible');
      continue;
    }
    if (gameVersionPatch(m.gameVersion) !== f.patch) {
      exclude('different_patch');
      continue;
    }
    const selected = m.participants.filter(
      (p) => p.championId === f.championId && normalizeRole(p.role) === f.role,
    );
    if (selected.length !== 1) {
      exclude('ambiguous_subject');
      continue;
    }
    const p = selected[0];
    if (
      m.participants.filter(
        (r) => r.teamId === p.teamId && normalizeRole(r.role) === f.role,
      ).length !== 1
    ) {
      exclude('ambiguous_role');
      continue;
    }
    const { opponent, reason } = selectUniqueOpponent(p, m.participants);
    if (!opponent) {
      exclude(reason!);
      continue;
    }
    if (
      f.opponentChampionId !== undefined &&
      opponent.championId !== f.opponentChampionId
    ) {
      exclude('different_matchup');
      continue;
    }
    if (
      m.processing?.status !== 'COMPLETED' ||
      !m.processing.completedAt ||
      m.processing.processingVersion === null ||
      m.processing.processingVersion < 2 ||
      m.timelineProjection?.projectionVersion !== 1 ||
      !Array.isArray(m.timelineProjection?.frames)
    ) {
      exclude('missing_or_unsupported_projection');
      continue;
    }
    const end = m.timelineProjection.observedEndMs;
    if (
      end === null ||
      !Number.isFinite(end) ||
      end < f.checkpointMs ||
      m.gameDuration * 1000 < f.checkpointMs
    ) {
      exclude('short_or_unknown_duration');
      continue;
    }
    const frame = selectCheckpoint(
      m.timelineProjection.frames.filter(
        (r): r is typeof r & { timestamp: number } =>
          r !== null && typeof r.timestamp === 'number',
      ),
      f.checkpointMs,
      end,
      'pastOnly',
    );
    if (!frame.frame) {
      exclude('missing_past_frame');
      continue;
    }
    const snapshots = Object.values(frame.frame.participantFrames ?? {}).filter(
      (r) => r !== null && r.puuid === p.puuid,
    );
    const snapshot = snapshots.length === 1 ? snapshots[0] : null;
    if (
      !snapshot ||
      snapshot.totalGold === null ||
      snapshot.currentGold === null ||
      !Number.isFinite(snapshot.totalGold) ||
      !Number.isFinite(snapshot.currentGold) ||
      snapshot.totalGold < 0 ||
      snapshot.currentGold < 0
    ) {
      exclude('missing_resources');
      continue;
    }
    const bundle = catalogs[m.gameVersion];
    if (!bundle) {
      exclude('missing_catalog_bundle');
      continue;
    }
    const compatible = (c: {
      gameVersion: string;
      version: string | null;
      reason: unknown;
    }) =>
      c.reason === null &&
      c.gameVersion === m.gameVersion &&
      c.version !== null &&
      gameVersionPatch(c.version) === f.patch;
    const unique = new Map<string, ProgressionEvent>();
    let conflict = false;
    for (const e of m.events) {
      const key = `${e.matchId}:${e.frameIndex}:${e.eventIndex}`;
      const previous = unique.get(key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(e))
        conflict = true;
      else unique.set(key, e);
    }
    const source = [...unique.values()];
    const ends = source.filter((e) => e.type === 'GAME_END');
    const trustworthy =
      !conflict &&
      source.every(
        (e) =>
          e.matchId === m.matchId &&
          e.processingVersion === m.processing!.processingVersion &&
          e.metricVersion === 1,
      ) &&
      ends.length === 1 &&
      ends[0].timestampMs === end &&
      [100, 200].includes(object(ends[0].payload).winningTeam) &&
      p.win === (object(ends[0].payload).winningTeam === p.teamId);
    if (!trustworthy) {
      exclude('conflicting_event_generation_or_end');
      continue;
    }
    const prefix = source.filter(
      (e) =>
        e.timestampMs !== null &&
        e.timestampMs >= 0 &&
        e.timestampMs <= f.checkpointMs,
    );
    const own = prefix.filter(
      (e) => e.actorPuuid === p.puuid && itemTypes.includes(e.type ?? ''),
    );
    const ledger = buildItemLedger(own, bundle.items);
    const uncertainEvents =
      source.some(
        (e) =>
          object(e.quality).unknownType === true &&
          e.timestampMs === null &&
          (e.actorPuuid === p.puuid || e.actorPuuid === null),
      ) ||
      source.some(
        (e) =>
          itemTypes.includes(e.type ?? '') &&
          (e.timestampMs === null || e.timestampMs < 0) &&
          (e.actorPuuid === p.puuid || e.actorPuuid === null),
      ) ||
      prefix.some(
        (e) =>
          itemTypes.includes(e.type ?? '') &&
          (e.actorPuuid === null ||
            (e.actorPuuid === p.puuid &&
              (object(e.quality).unknownType === true ||
                ['missingFields', 'invalidFields', 'conflicts'].some(
                  (k) =>
                    Array.isArray(object(e.quality)[k]) &&
                    object(e.quality)[k].length > 0,
                )))),
      ) ||
      prefix.some(
        (e) =>
          object(e.quality).unknownType === true &&
          (e.actorPuuid === p.puuid || e.actorPuuid === null),
      );
    const itemAvailable =
      compatible(bundle.items) &&
      ledger.issues.length === 0 &&
      ledger.acquisitions.every(
        (a) =>
          a.effective !== null &&
          (a.effective === false || bundle.items.items[String(a.itemId)]),
      ) &&
      !uncertainEvents;
    if (!itemAvailable) add(missingness, 'items_unknown_catalog_or_trajectory');
    const effective = new Map<number, ItemObservation>();
    if (itemAvailable)
      for (const a of ledger.acquisitions)
        if (
          a.effective === true &&
          a.timestampMs !== null &&
          !effective.has(a.itemId)
        ) {
          const atPurchase = selectCheckpoint(
            m.timelineProjection.frames.filter(
              (r): r is typeof r & { timestamp: number } =>
                r !== null && typeof r.timestamp === 'number',
            ),
            a.timestampMs,
            end,
            'pastOnly',
          );
          const snapshots = Object.values(
            atPurchase.frame?.participantFrames ?? {},
          ).filter((s) => s !== null && s.puuid === p.puuid);
          const resource = snapshots.length === 1 ? snapshots[0] : null;
          const valid =
            resource !== null &&
            typeof resource.totalGold === 'number' &&
            Number.isFinite(resource.totalGold) &&
            resource.totalGold >= 0 &&
            typeof resource.currentGold === 'number' &&
            Number.isFinite(resource.currentGold) &&
            resource.currentGold >= 0;
          effective.set(a.itemId, {
            id: a.itemId,
            acquisitionMs: a.timestampMs,
            eventId: a.eventId,
            goldBeforeAcquisition: valid ? resource!.totalGold : null,
            currentGoldBeforeAcquisition: valid ? resource!.currentGold : null,
            acquisitionFrameTimestampMs: valid ? atPurchase.timestampMs : null,
          });
        }
    const runeChoice = compatible(bundle.choices)
      ? runes(p, bundle.choices)
      : null;
    if (!runeChoice)
      add(missingness, 'runes_missing_invalid_or_unknown_catalog');
    const spellIds =
      compatible(bundle.choices) &&
      p.spells.length === 2 &&
      new Set(p.spells).size === 2 &&
      p.spells.every(
        (id) => positiveId(id) && bundle.choices.summoners[String(id)],
      )
        ? [...p.spells].sort((a, b) => a - b)
        : null;
    if (!spellIds)
      add(missingness, 'summoners_missing_invalid_or_unknown_catalog');
    rows.push({
      matchId: m.matchId,
      puuid: p.puuid,
      win: p.win,
      opponentChampionId: opponent.championId,
      totalGold: snapshot.totalGold,
      currentGold: snapshot.currentGold,
      frameTimestampMs: frame.timestampMs!,
      goldBin: Math.floor(snapshot.totalGold / 2000) * 2000,
      itemAvailable,
      items: [...effective.values()],
      runeIds: runeChoice?.ids ?? null,
      runeKey: runeChoice?.key ?? null,
      spellIds,
      catalogs: bundle,
      processingVersion: m.processing.processingVersion,
      processedAt: m.processing.completedAt.toISOString(),
    });
  }
  const strata = new Map<string, Observation[]>();
  for (const row of rows) {
    const key = `${row.opponentChampionId}:${row.goldBin}`;
    const group = strata.get(key) ?? [];
    group.push(row);
    strata.set(key, group);
  }
  const contexts = [...strata.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, context]) => {
      const itemRows = context.filter((r) => r.itemAvailable),
        runeRows = context.filter((r) => r.runeIds !== null),
        spellRows = context.filter((r) => r.spellIds !== null);
      const makeGroups = (
        family: 'item' | 'runes' | 'summoners',
        eligible: Observation[],
      ) => {
        const groups = new Map<
          string,
          { ids: number[]; members: Observation[] }
        >();
        for (const r of eligible) {
          const choices =
            family === 'item'
              ? r.items.map((i) => ({ key: String(i.id), ids: [i.id] }))
              : family === 'runes'
                ? [{ key: r.runeKey!, ids: r.runeIds! }]
                : [{ key: r.spellIds!.join(','), ids: r.spellIds! }];
          for (const c of choices) {
            const g = groups.get(c.key) ?? { ids: c.ids, members: [] };
            g.members.push(r);
            groups.set(c.key, g);
          }
        }
        return [...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, g]) => {
            const members = new Set(g.members.map((r) => r.matchId));
            const complement = eligible.filter((r) => !members.has(r.matchId));
            return {
              choiceKey: key,
              ids: g.ids,
              ...outcome(g.members),
              denominatorN: eligible.length,
              share: g.members.length / eligible.length,
              comparison: outcome(complement),
              meanTotalGold: mean(g.members.map((r) => r.totalGold)),
              meanCurrentGold: mean(g.members.map((r) => r.currentGold)),
              meanAcquisitionMs:
                family === 'item'
                  ? mean(
                      g.members.map(
                        (r) =>
                          r.items.find((i) => i.id === g.ids[0])!.acquisitionMs,
                      ),
                    )
                  : null,
              acquisitionResources:
                family === 'item'
                  ? (() => {
                      const acquired = g.members.map(
                        (r) => r.items.find((i) => i.id === g.ids[0])!,
                      );
                      const valid = acquired.filter(
                        (i) =>
                          i.goldBeforeAcquisition !== null &&
                          i.currentGoldBeforeAcquisition !== null,
                      );
                      return {
                        validN: valid.length,
                        totalN: acquired.length,
                        meanTotalGold: mean(
                          valid.map((i) => i.goldBeforeAcquisition!),
                        ),
                        meanCurrentGold: mean(
                          valid.map((i) => i.currentGoldBeforeAcquisition!),
                        ),
                        missingReason:
                          valid.length < acquired.length
                            ? 'missing_past_acquisition_resources'
                            : null,
                      };
                    })()
                  : null,
              metadata: g.ids.map((id) => ({
                id,
                name:
                  family === 'item'
                    ? (g.members[0].catalogs.items.items[String(id)]?.name ??
                      null)
                    : family === 'runes'
                      ? (g.members[0].catalogs.choices.runes[String(id)]
                          ?.name ??
                        g.members[0].catalogs.choices.styles[String(id)]
                          ?.name ??
                        null)
                      : (g.members[0].catalogs.choices.summoners[String(id)]
                          ?.name ?? null),
                reason:
                  family === 'runes' &&
                  !g.members[0].catalogs.choices.runes[String(id)] &&
                  !g.members[0].catalogs.choices.styles[String(id)]
                    ? 'stat_perk_catalog_unavailable'
                    : null,
              })),
              catalogVersions: [
                ...new Set(
                  g.members.map((r) =>
                    family === 'item'
                      ? r.catalogs.items.version
                      : r.catalogs.choices.version,
                  ),
                ),
              ].sort(),
              evidence: g.members.slice(0, 3).map((r) => ({
                matchId: r.matchId,
                puuid: r.puuid,
                frameTimestampMs: r.frameTimestampMs,
                sourceMaxTimestampMs: f.checkpointMs,
                acquisitionFrameTimestampMs:
                  family === 'item'
                    ? r.items.find((i) => i.id === g.ids[0])!
                        .acquisitionFrameTimestampMs
                    : null,
                processingVersion: r.processingVersion,
                processedAt: r.processedAt,
                eventId:
                  family === 'item'
                    ? r.items.find((i) => i.id === g.ids[0])!.eventId
                    : null,
              })),
            };
          });
      };
      return {
        opponentChampionId: context[0].opponentChampionId,
        goldBin: {
          lower: context[0].goldBin,
          upperExclusive: context[0].goldBin + 2000,
        },
        n: context.length,
        baseline: outcome(context),
        denominators: {
          items: itemRows.length,
          runes: runeRows.length,
          summoners: spellRows.length,
        },
        alternatives: {
          items: makeGroups('item', itemRows),
          runes: makeGroups('runes', runeRows),
          summoners: makeGroups('summoners', spellRows),
        },
      };
    });
  return {
    methodVersion: BUILD_CHOICE_METHOD_VERSION,
    opportunities: ['B03', 'B05'],
    filters: f,
    coverage: {
      queriedMatches: cohort.totalMatches,
      returnedMatches: cohort.matches.length,
      eligibleMatches: rows.length,
      players: new Set(rows.map((r) => r.puuid)).size,
      truncated: cohort.truncated,
      processingVersions: [
        ...new Set(rows.map((r) => r.processingVersion)),
      ].sort((a, b) => a - b),
      exclusions,
      missingness,
    },
    checkpoint: {
      targetMs: f.checkpointMs,
      mode: 'pastOnly',
      toleranceMs: 60000,
      resourceGoldBinWidth: 2000,
      minimumDescriptiveN: 30,
    },
    catalogs: Object.entries(catalogs).map(([gameVersion, c]) => ({
      gameVersion,
      items: { version: c.items.version, reason: c.items.reason },
      choices: { version: c.choices.version, reason: c.choices.reason },
    })),
    contexts,
    interpretation:
      'Observed associations conditional on exact patch/champion/role, unique opponent, survival to checkpoint and gold band. Items mean effective observed purchases by t, including later sold or destroyed items; not currently held slots. Only undo observed by t is used; future undo cannot rewrite the past. Acquisition and resources use no evidence after t; win is a final descriptive outcome. Purchasing power and selection bias remain; never an optimal build or victory guarantee.',
    uncertainty:
      '95% Wilson intervals are nominal under independent matches; repeated players, matchup selection, gold conditioning and overlapping item groups invalidate causal or calibrated population claims. N<30 is insufficient by method1 policy; no ranking or recommendation. Latest limited sample is not random; truncation is explicit. Rune stat-perk IDs are preserved with unavailable metadata because runesReforged omits shards. Runes and summoners are initial selections, not later spell replacements.',
  };
}
export type BuildChoiceResult = ReturnType<typeof calculateBuildChoices>;
