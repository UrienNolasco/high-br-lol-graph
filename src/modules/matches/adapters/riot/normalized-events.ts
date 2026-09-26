import type { TimelineDto } from '../../../../core/riot/dto/timeline.dto';
import type {
  EventQuality,
  NormalizedTimelineEvent,
} from '../../contracts/normalized-events';

export const EVENT_METRIC_VERSION = 1;
export interface EventNormalizationMetadata {
  processingVersion: number;
}
export const KNOWN_EVENT_TYPES = new Set([
  'CHAMPION_KILL',
  'CHAMPION_SPECIAL_KILL',
  'WARD_PLACED',
  'WARD_KILL',
  'ELITE_MONSTER_KILL',
  'BUILDING_KILL',
  'TURRET_PLATE_DESTROYED',
  'ITEM_PURCHASED',
  'ITEM_SOLD',
  'ITEM_DESTROYED',
  'ITEM_UNDO',
  'SKILL_LEVEL_UP',
  'LEVEL_UP',
  'DRAGON_SOUL_GIVEN',
  'GAME_END',
  'PAUSE_END',
  'OBJECTIVE_BOUNTY_PRESTART',
  'OBJECTIVE_BOUNTY_FINISH',
]);
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number =>
  finite(v) && Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
const team = (v: unknown): v is 100 | 200 => v === 100 || v === 200;
const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/** One row per source index. Timestamps are never event identifiers and no source event is deduplicated. */
export function normalizeTimelineEvents(
  timeline: TimelineDto,
  participantMap: ReadonlyMap<number, string>,
  participantTeams: ReadonlyMap<number, number> = new Map(),
  metadata: EventNormalizationMetadata,
): NormalizedTimelineEvent[] {
  return timeline.info.frames.flatMap((frame, frameIndex) =>
    frame.events.map((raw, eventIndex) => {
      const payload = structuredClone(raw) as unknown as Record<
        string,
        unknown
      >;
      const quality: EventQuality = {
        unknownType: !KNOWN_EVENT_TYPES.has(raw.type),
        missingFields: [],
        invalidFields: [],
        sentinelFields: [],
        unresolvedParticipantIds: [],
        conflicts: [],
      };
      const missing = (field: string) => quality.missingFields.push(field);
      const invalid = (field: string) => quality.invalidFields.push(field);
      const readInteger = (value: unknown, field: string) => {
        if (value === null || value === undefined) {
          missing(field);
          return null;
        }
        if (!integer(value)) {
          invalid(field);
          return null;
        }
        return value;
      };
      const readTeam = (value: unknown, field: string) => {
        if (value === null || value === undefined) {
          missing(field);
          return null;
        }
        if (value === 0) {
          quality.sentinelFields.push(field);
          return null;
        }
        if (!team(value)) {
          invalid(field);
          return null;
        }
        return value;
      };
      const readParticipant = (value: unknown, field: string) => {
        const id = readInteger(value, field);
        if (id === null) return null;
        if (id === 0) {
          quality.sentinelFields.push(field);
          return null;
        }
        if (!participantMap.get(id)) quality.unresolvedParticipantIds.push(id);
        return id;
      };
      const actorField =
        raw.type === 'WARD_PLACED'
          ? 'creatorId'
          : [
                'CHAMPION_KILL',
                'CHAMPION_SPECIAL_KILL',
                'WARD_KILL',
                'BUILDING_KILL',
                'TURRET_PLATE_DESTROYED',
                'ELITE_MONSTER_KILL',
              ].includes(raw.type)
            ? 'killerId'
            : [
                  'ITEM_PURCHASED',
                  'ITEM_SOLD',
                  'ITEM_DESTROYED',
                  'ITEM_UNDO',
                  'SKILL_LEVEL_UP',
                  'LEVEL_UP',
                ].includes(raw.type)
              ? 'participantId'
              : null;
      const actorParticipantId = actorField
        ? readParticipant(payload[actorField], actorField)
        : null;
      const victimParticipantId =
        raw.type === 'CHAMPION_KILL'
          ? readParticipant(payload.victimId, 'victimId')
          : null;
      const assists = payload.assistingParticipantIds;
      let assistingParticipantIds: number[] | null = null;
      if (Array.isArray(assists)) {
        assistingParticipantIds = assists.flatMap((id, index) => {
          const resolved = readParticipant(
            id,
            `assistingParticipantIds[${index}]`,
          );
          return resolved === null ? [] : [resolved];
        });
      } else if (assists !== undefined && assists !== null)
        invalid('assistingParticipantIds');
      else if (
        ['CHAMPION_KILL', 'BUILDING_KILL', 'ELITE_MONSTER_KILL'].includes(
          raw.type,
        )
      )
        missing('assistingParticipantIds');
      let sourceTeamId: number | null =
        actorParticipantId === null
          ? null
          : readTeam(participantTeams.get(actorParticipantId), 'actorTeamId');
      let ownerTeamId: number | null = null;
      let beneficiaryTeamId: number | null = null;
      if (raw.type === 'ELITE_MONSTER_KILL') {
        // killerTeamId is the explicit objective beneficiary, including killerId=0.
        beneficiaryTeamId = readTeam(payload.killerTeamId, 'killerTeamId');
        if (
          beneficiaryTeamId !== null &&
          sourceTeamId !== null &&
          beneficiaryTeamId !== sourceTeamId
        )
          quality.conflicts.push('killerTeamId_disagrees_with_actor');
        sourceTeamId ??= beneficiaryTeamId;
      } else if (
        raw.type === 'BUILDING_KILL' ||
        raw.type === 'TURRET_PLATE_DESTROYED'
      ) {
        ownerTeamId = readTeam(payload.teamId, 'teamId');
        beneficiaryTeamId =
          ownerTeamId === 100 ? 200 : ownerTeamId === 200 ? 100 : null;
        if (
          sourceTeamId !== null &&
          beneficiaryTeamId !== null &&
          sourceTeamId !== beneficiaryTeamId
        )
          quality.conflicts.push('building_owner_disagrees_with_actor');
      } else if (
        [
          'DRAGON_SOUL_GIVEN',
          'OBJECTIVE_BOUNTY_PRESTART',
          'OBJECTIVE_BOUNTY_FINISH',
        ].includes(raw.type)
      ) {
        beneficiaryTeamId = readTeam(payload.teamId, 'teamId');
      } else if (raw.type === 'GAME_END') {
        beneficiaryTeamId = readTeam(payload.winningTeam, 'winningTeam');
      } else if (raw.type === 'WARD_PLACED') {
        ownerTeamId = sourceTeamId;
      } else if (raw.type === 'CHAMPION_KILL') {
        beneficiaryTeamId = sourceTeamId;
      }
      const position = object(payload.position);
      const coordinate = (field: 'x' | 'y') => {
        const value = position?.[field];
        if (value === null || value === undefined) {
          if (
            [
              'CHAMPION_KILL',
              'CHAMPION_SPECIAL_KILL',
              'WARD_PLACED',
              'WARD_KILL',
              'BUILDING_KILL',
              'TURRET_PLATE_DESTROYED',
              'ELITE_MONSTER_KILL',
            ].includes(raw.type)
          )
            missing(`position.${field}`);
          return null;
        }
        if (!finite(value)) {
          invalid(`position.${field}`);
          return null;
        }
        return value;
      };
      // Unknown types retain their entire payload. Their field names do not establish semantics.
      return {
        matchId: timeline.metadata.matchId,
        frameIndex,
        eventIndex,
        type: typeof raw.type === 'string' && raw.type.length ? raw.type : null,
        timestampMs: readInteger(payload.timestamp, 'timestamp'),
        frameTimestampMs: readInteger(frame.timestamp, 'frame.timestamp'),
        actorParticipantId,
        actorPuuid:
          actorParticipantId === null
            ? null
            : (participantMap.get(actorParticipantId) ?? null),
        victimParticipantId,
        victimPuuid:
          victimParticipantId === null
            ? null
            : (participantMap.get(victimParticipantId) ?? null),
        assistingParticipantIds,
        assistingPuuids:
          assistingParticipantIds?.map(
            (id) => participantMap.get(id) ?? null,
          ) ?? null,
        sourceTeamId,
        ownerTeamId,
        beneficiaryTeamId,
        positionX: coordinate('x'),
        positionY: coordinate('y'),
        lane: typeof payload.laneType === 'string' ? payload.laneType : null,
        tier: typeof payload.towerType === 'string' ? payload.towerType : null,
        payload,
        quality,
        metricVersion: EVENT_METRIC_VERSION,
        processingVersion: metadata.processingVersion,
      };
    }),
  );
}
