export interface MatchParticipant {
  puuid: string;
  championId: number;
  championName: string;
  role: string;
  teamId: number;
  totalDamage: number;
  goldEarned: number;
  csGraph: number[];
  visionScore: number;
  damageTaken: number;
  kda: number;
  match?: { gameDuration: number };
}

export interface PerformanceMetrics {
  championId: number;
  championName: string;
  role: string;
  dpm: number;
  gpm: number;
  cspm: number;
  visionScorePerMin: number;
  damageTakenPerMin: number;
  kda: number;
}

export interface OpponentMetrics extends PerformanceMetrics {
  puuid: string;
}

export interface Comparison {
  dpmAdvantage: number;
  dpmAdvantagePercent: number;
  gpmAdvantage: number;
  gpmAdvantagePercent: number;
  cspmAdvantage: number;
  cspmAdvantagePercent: number;
  visionAdvantage: number;
  survivability: number;
}

export function computePlayerMetrics(
  player: MatchParticipant,
  gameDurationMinutes: number,
): PerformanceMetrics {
  const lastCs =
    player.csGraph.length > 0 ? player.csGraph[player.csGraph.length - 1] : 0;

  return {
    championId: player.championId,
    championName: player.championName,
    role: player.role,
    dpm: parseFloat((player.totalDamage / gameDurationMinutes).toFixed(1)),
    gpm: parseFloat((player.goldEarned / gameDurationMinutes).toFixed(1)),
    cspm: parseFloat((lastCs / gameDurationMinutes).toFixed(1)),
    visionScorePerMin: parseFloat(
      (player.visionScore / gameDurationMinutes).toFixed(2),
    ),
    damageTakenPerMin: parseFloat(
      (player.damageTaken / gameDurationMinutes).toFixed(1),
    ),
    kda: player.kda,
  };
}

export function findLaneOpponent(
  participants: MatchParticipant[],
  player: MatchParticipant,
): MatchParticipant | undefined {
  return participants.find(
    (p) => p.role === player.role && p.teamId !== player.teamId,
  );
}

export function computeComparison(
  player: PerformanceMetrics,
  opponent: OpponentMetrics,
): Comparison {
  const safeDivide = (a: number, b: number) =>
    b !== 0 ? parseFloat(((a / b) * 100).toFixed(1)) : 0;

  return {
    dpmAdvantage: parseFloat((player.dpm - opponent.dpm).toFixed(1)),
    dpmAdvantagePercent: safeDivide(player.dpm - opponent.dpm, opponent.dpm),
    gpmAdvantage: parseFloat((player.gpm - opponent.gpm).toFixed(1)),
    gpmAdvantagePercent: safeDivide(player.gpm - opponent.gpm, opponent.gpm),
    cspmAdvantage: parseFloat((player.cspm - opponent.cspm).toFixed(1)),
    cspmAdvantagePercent: safeDivide(
      player.cspm - opponent.cspm,
      opponent.cspm,
    ),
    visionAdvantage: parseFloat(
      (player.visionScorePerMin - opponent.visionScorePerMin).toFixed(2),
    ),
    survivability: parseFloat(
      (opponent.damageTakenPerMin - player.damageTakenPerMin).toFixed(1),
    ),
  };
}
