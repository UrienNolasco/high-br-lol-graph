import type {
  ParticipantSnapshot,
  SnapshotFrame,
  TimelineSnapshotProjection,
} from '../../contracts/normalized-snapshots';

import { SNAPSHOT_PROJECTION_VERSION } from '../../contracts/snapshot-readers';
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nullable = (value: unknown): number | null =>
  finite(value) ? value : null;
const object = (value: unknown): Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
const DAMAGE_FIELDS = [
  'magicDamageDone',
  'magicDamageDoneToChampions',
  'magicDamageTaken',
  'physicalDamageDone',
  'physicalDamageDoneToChampions',
  'physicalDamageTaken',
  'totalDamageDone',
  'totalDamageDoneToChampions',
  'totalDamageTaken',
  'trueDamageDone',
  'trueDamageDoneToChampions',
  'trueDamageTaken',
];
const CHAMPION_FIELDS = [
  'abilityHaste',
  'abilityPower',
  'armor',
  'armorPen',
  'armorPenPercent',
  'attackDamage',
  'attackSpeed',
  'bonusArmorPenPercent',
  'bonusMagicPenPercent',
  'ccReduction',
  'cooldownReduction',
  'health',
  'healthMax',
  'healthRegen',
  'lifesteal',
  'magicPen',
  'magicPenPercent',
  'magicResist',
  'movementSpeed',
  'omnivamp',
  'physicalVamp',
  'power',
  'powerMax',
  'powerRegen',
  'spellVamp',
];
const stats = (value: unknown, known: string[]) =>
  value == null
    ? null
    : Object.fromEntries(
        [...new Set([...known, ...Object.keys(object(value))])].map((key) => [
          key,
          nullable(object(value)[key]),
        ]),
      );

/** Preserve frame identity/order; normalization never creates absent participants. */
export function projectTimelineSnapshots(
  timeline: unknown,
  participants: ReadonlyMap<number, string>,
): TimelineSnapshotProjection {
  const info = object(object(timeline).info);
  const sourceFrames: Record<string, any>[] = Array.isArray(info.frames)
    ? info.frames
    : [];
  const ends: number[] = [];
  const frames = sourceFrames.map((source, frameIndex): SnapshotFrame => {
    for (const event of source.events ?? []) {
      if (
        event.type === 'GAME_END' &&
        finite(event.timestamp) &&
        event.timestamp >= 0 &&
        [100, 200].includes(event.winningTeam)
      )
        ends.push(event.timestamp);
    }
    const participantFrames = Object.fromEntries(
      Object.entries(object(source.participantFrames)).map(([id, raw]) => {
        const p = object(raw);
        const known = [
          'participantId',
          'totalGold',
          'currentGold',
          'xp',
          'level',
          'minionsKilled',
          'jungleMinionsKilled',
          'position',
          'damageStats',
          'championStats',
        ];
        const scalarKeys = [
          'totalGold',
          'currentGold',
          'xp',
          'level',
          'minionsKilled',
          'jungleMinionsKilled',
        ] as const;
        const values = Object.fromEntries(
          scalarKeys.map((key) => [key, nullable(p[key])]),
        ) as Pick<ParticipantSnapshot, (typeof scalarKeys)[number]>;
        const missingFields: string[] = scalarKeys.filter(
          (key) => values[key] === null,
        );
        const damageStats = stats(p.damageStats, DAMAGE_FIELDS),
          championStats = stats(p.championStats, CHAMPION_FIELDS);
        if (damageStats === null) missingFields.push('damageStats');
        if (championStats === null) missingFields.push('championStats');
        for (const [prefix, stat] of [
          ['damageStats', damageStats],
          ['championStats', championStats],
        ] as const) {
          for (const [key, value] of Object.entries(stat ?? {}))
            if (value === null) missingFields.push(`${prefix}.${key}`);
        }
        const position =
          p.position == null
            ? null
            : { x: nullable(p.position.x), y: nullable(p.position.y) };
        if (position === null) missingFields.push('position');
        else {
          if (position.x === null) missingFields.push('position.x');
          if (position.y === null) missingFields.push('position.y');
        }
        return [
          id,
          {
            participantId: Number(id),
            puuid: participants.get(Number(id)) ?? null,
            ...values,
            position,
            damageStats,
            championStats,
            additionalFields: Object.fromEntries(
              Object.entries(p).filter(([key]) => !known.includes(key)),
            ),
            missingFields,
          },
        ];
      }),
    );
    return {
      frameIndex,
      timestamp:
        finite(source.timestamp) && source.timestamp >= 0
          ? source.timestamp
          : null,
      participantFrames,
    };
  });
  return {
    projectionVersion: SNAPSHOT_PROJECTION_VERSION,
    frameIntervalMs: nullable(info.frameInterval),
    observedEndMs: ends.length ? Math.max(...ends) : null,
    frames,
  };
}
