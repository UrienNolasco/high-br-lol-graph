import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchRepository } from '../repositories/match.repository';
import {
  computeGoldTimeline,
  determineWinner,
  findMaxAdvantage,
  findObservedSwing,
} from '../pure/gold-calculator';
import { MatchGoldTimelineDto } from '../dto/match-deep-dive.dto';
import {
  METRIC_VERSION,
  metricQuality,
} from '../../../core/metrics/metric-contract';

@Injectable()
export class MatchGoldTimelineService {
  constructor(private readonly matchRepo: MatchRepository) {}

  async getGoldTimeline(matchId: string): Promise<MatchGoldTimelineDto> {
    const match = await this.matchRepo.findGoldTimeline(matchId);
    if (!match) throw new NotFoundException(`Match ${matchId} not found`);

    // Only the validated Summoner's Rift 5v5 representation has defined totals.
    const supported = match.mapId === 11;
    const goldDifference = supported
      ? computeGoldTimeline(match.participants)
      : [];
    const valid = goldDifference.filter((entry) => entry.difference !== null);
    const winner = determineWinner(match.teams);
    const observedSwing = findObservedSwing(goldDifference);
    const validPairs = goldDifference
      .slice(1)
      .filter(
        (entry, i) =>
          entry.difference !== null && goldDifference[i].difference !== null,
      ).length;
    const reason = !supported
      ? 'unsupported_version'
      : goldDifference.some((entry) => entry.reason === 'invalid_value')
        ? 'invalid_value'
        : 'missing_frame';

    return {
      matchId,
      metricId: 'O08',
      metricVersion: METRIC_VERSION,
      goldDifference,
      winner,
      winnerReason: winner
        ? null
        : match.teams.length < 2
          ? 'missing_field'
          : 'invalid_value',
      maxAdvantage: findMaxAdvantage(goldDifference),
      maxAdvantageReason: valid.length ? null : reason,
      observedSwing,
      observedSwingReason: observedSwing
        ? null
        : validPairs
          ? 'not_observed'
          : reason,
      throwPoint: observedSwing,
      coverage: metricQuality(valid.length, goldDifference.length),
      reason: valid.length ? null : reason,
      evidence: {
        winnerSource: 'MatchTeam.win',
        teams: match.teams,
        goldSource: 'MatchParticipant.goldGraph',
        gameVersion: match.gameVersion,
        mapId: match.mapId,
        expectedParticipantsPerTeam: 5,
        timeBasis: 'legacy_minute_index',
        swingThresholdGold: 3000,
        validAdjacentPairs: validPairs,
      },
    };
  }
}
