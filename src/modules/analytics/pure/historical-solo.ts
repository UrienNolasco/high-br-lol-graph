import {
  CombatEvent,
  CombatParticipant,
  calculateSoloCheckpoints,
} from '../../matches/pure/combat-calculator';
import { CombatSource, combatInput } from '../../matches/pure/combat-source';
import { observation } from './cohort-calculator';
import { metricQuality } from '../../matches/contracts/metric-contract';
export interface SoloCohortRow {
  matchId: string;
  puuid: string;
  match: { gameDuration: number; participants: CombatParticipant[] };
}
export function historicalSolo(
  matches: SoloCohortRow[],
  events: CombatEvent[],
  sources: CombatSource[],
) {
  const eventsByMatch = new Map<string, CombatEvent[]>();
  for (const event of events) {
    const rows = eventsByMatch.get(event.matchId) ?? [];
    rows.push(event);
    eventsByMatch.set(event.matchId, rows);
  }
  const sourceByMatch = new Map(
    sources.map((source) => [source.matchId, source]),
  );
  const soloEvidence = matches.map((row) => {
    const input = combatInput(
      {
        matchId: row.matchId,
        gameDuration: row.match.gameDuration,
        participants: row.match.participants,
      },
      eventsByMatch.get(row.matchId) ?? [],
      sourceByMatch.get(row.matchId),
    );
    if (!input)
      return {
        matchId: row.matchId,
        soloKills15: null,
        soloDeaths15: null,
        soloKills15Reason: 'missing_projection',
        soloDeaths15Reason: 'missing_projection',
        killsQuality: metricQuality(0, 0),
        deathsQuality: metricQuality(0, 0),
        killEvidence: [],
        deathEvidence: [],
      };
    const metrics = calculateSoloCheckpoints(input, row.puuid);
    return {
      matchId: row.matchId,
      soloKills15: metrics.soloKills15.value,
      soloDeaths15: metrics.soloDeaths15.value,
      soloKills15Reason: metrics.soloKills15.reason,
      soloDeaths15Reason: metrics.soloDeaths15.reason,
      killsQuality: metrics.soloKills15.quality,
      deathsQuality: metrics.soloDeaths15.quality,
      killEvidence: metrics.soloKills15.evidence,
      deathEvidence: metrics.soloDeaths15.evidence,
    };
  });
  const kills = observation(soloEvidence.map((e) => e.soloKills15));
  const deaths = observation(soloEvidence.map((e) => e.soloDeaths15));
  return {
    soloKills15: kills.value,
    soloDeaths15: deaths.value,
    avgSoloKills15: kills.value,
    avgSoloDeaths15: deaths.value,
    soloKills15Reason: kills.reason,
    soloDeaths15Reason: deaths.reason,
    soloMetricVersion: 1,
    soloAggregation: 'mean_per_valid_match' as const,
    soloSamples: { kills15: kills, deaths15: deaths },
    soloEvidence,
  };
}
