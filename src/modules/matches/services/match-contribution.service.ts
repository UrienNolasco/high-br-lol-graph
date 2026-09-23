import { Injectable, NotFoundException } from '@nestjs/common';
import { METRIC_VERSION, normalizeRole } from '../../../core/metrics';
import { MatchRepository } from '../repositories/match.repository';
import { computeContribution } from '../pure/contribution-calculator';
import { MatchContributionDto } from '../dto/match-contribution.dto';

@Injectable()
export class MatchContributionService {
  constructor(private readonly repository: MatchRepository) {}

  async getContribution(
    matchId: string,
    puuid: string,
  ): Promise<MatchContributionDto> {
    const { match, processing } =
      await this.repository.findContribution(matchId);
    if (!match) throw new NotFoundException(`Match ${matchId} not found`);
    const participant = match.participants.find((p) => p.puuid === puuid);
    if (!participant)
      throw new NotFoundException(
        `Player ${puuid} not found in match ${matchId}`,
      );
    const metadataKnown =
      processing?.status === 'COMPLETED' &&
      processing.processingVersion != null &&
      processing.completedAt != null;
    const result = metadataKnown
      ? computeContribution(
          {
            matchId,
            mapId: match.mapId,
            participants: match.participants,
            processingVersion: processing.processingVersion!,
            processedAt: processing.completedAt!.toISOString(),
          },
          participant,
        )
      : null;
    return {
      matchId,
      puuid,
      teamId: participant.teamId,
      championId: participant.championId,
      championName: participant.championName,
      role: normalizeRole(participant.role),
      roleExplanation: result?.roleExplanation ?? null,
      metricVersion: METRIC_VERSION,
      processingVersion: processing?.processingVersion ?? null,
      processedAt: processing?.completedAt?.toISOString() ?? null,
      reason: metadataKnown ? null : 'not_calculated',
      dimensions: result?.dimensions ?? null,
    };
  }
}
