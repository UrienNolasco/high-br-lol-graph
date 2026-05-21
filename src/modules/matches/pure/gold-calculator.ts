export interface GoldParticipant {
  teamId: number;
  goldGraph: number[];
}

export interface GoldDifferenceEntry {
  minute: number;
  blueTeam: number;
  redTeam: number;
  difference: number;
}

export interface MaxAdvantageEntry {
  minute: number;
  team: 'blueTeam' | 'redTeam';
  difference: number;
}

export interface ThrowPointEntry {
  minute: number;
  beforeDifference: number;
  afterDifference: number;
  swing: number;
}

export function computeGoldTimeline(
  participants: GoldParticipant[],
): GoldDifferenceEntry[] {
  const maxMinutes = Math.max(...participants.map((p) => p.goldGraph.length));

  return Array.from({ length: maxMinutes }, (_, minute) => {
    const blueTeam = participants
      .filter((p) => p.teamId === 100)
      .reduce((sum, p) => sum + (p.goldGraph[minute] || 0), 0);

    const redTeam = participants
      .filter((p) => p.teamId === 200)
      .reduce((sum, p) => sum + (p.goldGraph[minute] || 0), 0);

    return {
      minute,
      blueTeam,
      redTeam,
      difference: blueTeam - redTeam,
    };
  });
}

export function determineWinner(
  goldDifference: GoldDifferenceEntry[],
): 'blueTeam' | 'redTeam' {
  const last = goldDifference[goldDifference.length - 1];
  return last && last.difference > 0 ? 'blueTeam' : 'redTeam';
}

export function findMaxAdvantage(
  goldDifference: GoldDifferenceEntry[],
): MaxAdvantageEntry {
  const max = goldDifference.reduce((best, entry) =>
    Math.abs(entry.difference) > Math.abs(best.difference) ? entry : best,
  );

  return {
    minute: max.minute,
    team: max.difference > 0 ? 'blueTeam' : 'redTeam',
    difference: Math.abs(max.difference),
  };
}

export function findThrowPoint(
  goldDifference: GoldDifferenceEntry[],
  threshold: number = 3000,
): ThrowPointEntry | null {
  for (let i = 1; i < goldDifference.length; i++) {
    const swing = Math.abs(
      goldDifference[i].difference - goldDifference[i - 1].difference,
    );
    if (swing > threshold) {
      return {
        minute: i,
        beforeDifference: goldDifference[i - 1].difference,
        afterDifference: goldDifference[i].difference,
        swing,
      };
    }
  }
  return null;
}
