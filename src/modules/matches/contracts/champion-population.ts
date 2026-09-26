import { assessRemake } from './eligibility';

export function championPopulationEligibility(info: {
  gameVersion: string;
  gameDuration: number;
  mapId: number;
  queueId: number;
  participants: readonly unknown[];
}) {
  if (info.mapId !== 11 || ![420, 440].includes(info.queueId))
    return {
      populationEligible: false,
      populationExclusionReason: 'outside_cohort',
    };
  const result = assessRemake({
    gameVersion: info.gameVersion,
    durationSeconds: info.gameDuration,
    earlySurrenderFlags: info.participants.map((p) => {
      if (!p || typeof p !== 'object') return null;
      const flag = (p as Record<string, unknown>).gameEndedInEarlySurrender;
      return typeof flag === 'boolean' ? flag : null;
    }),
    surrender: null,
  });
  return {
    populationEligible: result.eligible,
    populationExclusionReason: result.reason,
  };
}

/** Empty arrays mean observed no bans; missing or malformed arrays mean unknown. */
export function bansAvailable(bans: unknown): boolean {
  return (
    Array.isArray(bans) &&
    bans.every(
      (b: unknown) =>
        b !== null &&
        typeof b === 'object' &&
        'championId' in b &&
        typeof b.championId === 'number' &&
        Number.isInteger(b.championId) &&
        b.championId >= -1,
    )
  );
}
