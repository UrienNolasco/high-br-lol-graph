import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ProcessedMatchData } from '../pure/match.parser';
import { TimelineParserService } from '../../../core/riot/timeline-parser.service';
import { extractPatch } from '../pure/match.parser';
import { getErrorMessage } from '../../../core/logger/get-error-message';

@Injectable()
export class MatchPersistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MatchPersistenceService.name);
  }

  async save(
    matchData: ProcessedMatchData,
    timelineData: ReturnType<TimelineParserService['parseTimeline']>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.match.create({ data: matchData.match });

      if (matchData.teams.length > 0) {
        await tx.matchTeam.createMany({ data: matchData.teams });
      }

      const participantsData = matchData.participants.map((participant) => {
        const timelineParticipant = timelineData.participants.get(participant.puuid);
        return {
          ...participant,
          goldGraph: timelineParticipant?.goldGraph || [],
          xpGraph: timelineParticipant?.xpGraph || [],
          csGraph: timelineParticipant?.csGraph || [],
          damageGraph: timelineParticipant?.damageGraph || [],
          deathPositions: (timelineParticipant?.deathPositions || []) as unknown as Prisma.InputJsonValue,
          killPositions: (timelineParticipant?.killPositions || []) as unknown as Prisma.InputJsonValue,
          wardPositions: (timelineParticipant?.wardPositions || []) as unknown as Prisma.InputJsonValue,
          pathingSample: (timelineParticipant?.pathingSample || []) as unknown as Prisma.InputJsonValue,
          skillOrder: timelineParticipant?.skillOrder || [],
          itemTimeline: (timelineParticipant?.itemTimeline || []) as unknown as Prisma.InputJsonValue,
        };
      });

      await tx.matchParticipant.createMany({ data: participantsData });
    });
  }

  async exists(matchId: string): Promise<boolean> {
    const existing = await this.prisma.match.findUnique({ where: { matchId } });
    return !!existing;
  }

  async updateChampionStats(matchData: ProcessedMatchData): Promise<void> {
    const patch = extractPatch(matchData.match.gameVersion);
    const queueId = matchData.match.queueId;
    const gameDurationInMinutes = matchData.match.gameDuration / 60;

    for (const participant of matchData.participants) {
      try {
        const current = await this.prisma.championStats.findUnique({
          where: {
            championId_patch_queueId: {
              championId: participant.championId,
              patch,
              queueId,
            },
          },
        });

        const gamesPlayed = (current?.gamesPlayed || 0) + 1;
        const wins = (current?.wins || 0) + (participant.win ? 1 : 0);
        const losses = (current?.losses || 0) + (participant.win ? 0 : 1);
        const winRate = (wins / gamesPlayed) * 100;

        const newKda =
          (current?.kda || 0) * ((current?.gamesPlayed || 0) / gamesPlayed) +
          participant.kda * (1 / gamesPlayed);

        const newDpm =
          (current?.dpm || 0) * ((current?.gamesPlayed || 0) / gamesPlayed) +
          (participant.totalDamage / gameDurationInMinutes) * (1 / gamesPlayed);

        const newGpm =
          (current?.gpm || 0) * ((current?.gamesPlayed || 0) / gamesPlayed) +
          (participant.goldEarned / gameDurationInMinutes) * (1 / gamesPlayed);

        const newCspm = current?.cspm || 0;

        await this.prisma.championStats.upsert({
          where: {
            championId_patch_queueId: {
              championId: participant.championId,
              patch,
              queueId,
            },
          },
          create: {
            championId: participant.championId,
            championName: participant.championName,
            patch,
            queueId,
            gamesPlayed: 1,
            wins: participant.win ? 1 : 0,
            losses: participant.win ? 0 : 1,
            winRate: participant.win ? 100 : 0,
            kda: participant.kda,
            dpm: participant.totalDamage / gameDurationInMinutes,
            cspm: 0,
            gpm: participant.goldEarned / gameDurationInMinutes,
            banRate: 0,
            pickRate: 0,
            tier: 'C',
            rank: 0,
          },
          update: { gamesPlayed, wins, losses, winRate, kda: newKda, dpm: newDpm, cspm: newCspm, gpm: newGpm },
        });
      } catch (error) {
        this.logger.warn(
          { championId: participant.championId, championName: participant.championName, event: 'champion_stats_error', error: getErrorMessage(error) },
          `Erro ao atualizar ChampionStats para ${participant.championName}`,
        );
      }
    }
  }
}
