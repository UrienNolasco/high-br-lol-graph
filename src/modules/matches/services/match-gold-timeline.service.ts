import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchRepository } from '../repositories/match.repository';
import {
  computeSnapshotGoldTimeline,
  determineWinner,
  findMaxAdvantage,
  findObservedSwing,
} from '../pure/gold-calculator';
import { MatchGoldTimelineDto } from '../dto/match-deep-dive.dto';
import { metricQuality } from '../contracts/metric-contract';
import { readSnapshotProjection } from '../contracts/snapshot-readers';

@Injectable()
export class MatchGoldTimelineService {
  constructor(private readonly matchRepo: MatchRepository) {}

  async getGoldTimeline(matchId: string): Promise<MatchGoldTimelineDto> {
    const match = await this.matchRepo.findGoldTimeline(matchId);
    if (!match) throw new NotFoundException(`Match ${matchId} not found`);

    // Only the validated Summoner's Rift 5v5 representation has defined totals.
    const supported = match.mapId === 11;
    const projection = readSnapshotProjection(match.timelineProjection);
    const goldDifference =
      supported && projection
        ? computeSnapshotGoldTimeline(projection, match.participants)
        : [];
    const valid = goldDifference.filter((entry) => entry.difference !== null);
    const winner = determineWinner(match.teams);
    const observedSwing = findObservedSwing(goldDifference);
    const validPairs = goldDifference
      .slice(1)
      .filter(
        (entry, i) =>
          entry.difference !== null &&
          goldDifference[i].difference !== null &&
          entry.timestampMs > goldDifference[i].timestampMs &&
          entry.timestampMs - goldDifference[i].timestampMs <= 120_000,
      ).length;
    const reason = !supported
      ? 'unsupported_version'
      : !projection
        ? 'missing_projection'
        : goldDifference.some((entry) => entry.reason === 'invalid_value')
          ? 'invalid_value'
          : 'missing_frame';

    return {
      matchId,
      metricId: 'O08',
      metricVersion: 2,
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
        goldSource: 'MatchTimelineProjection.frames',
        gameVersion: match.gameVersion,
        mapId: match.mapId,
        expectedParticipantsPerTeam: 5,
        timeBasis: 'observed_timestamp_ms',
        swingThresholdGold: 3000,
        validAdjacentPairs: validPairs,
      },
    };
  }
}
