import { Injectable, Logger } from '@nestjs/common';
import { RiotService } from '../../core/riot/riot.service';
import { ProcessMatchDto } from './dto/process-match.dto';
import {
  MatchParserService,
  MatchupData,
  MatchParticipant,
} from '../../core/riot/match-parser.service';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riotService: RiotService,
    private readonly matchParserService: MatchParserService,
  ) {}

  async processMatch(payload: ProcessMatchDto): Promise<void> {
    const { matchId } = payload;

    try {
      const processedMatch = await this.prisma.processedMatch.upsert({
        where: { matchId },
        create: { matchId, patch: 'processing' },
        update: {},
      });

      if (processedMatch.patch !== 'processing') {
        this.logger.warn(
          `Match ${matchId} has already been processed. Skipping.`,
        );
        return;
      }

      const matchDto = await this.riotService.getMatchById(matchId);
      const { patch, participants, matchups, gameDuration, bannedChampionIds } =
        this.matchParserService.parseMatchData(matchDto);

      for (const participant of participants) {
        await this.upsertChampionStats(patch, participant, gameDuration);
      }

      for (const bannedChampionId of bannedChampionIds) {
        await this.incrementBanCount(patch, bannedChampionId);
      }

      for (const matchup of matchups) {
        await this.upsertMatchupStats(patch, matchup);
      }

      await this.prisma.processedMatch.update({
        where: { matchId },
        data: { patch },
      });

      this.logger.log(
        `✅ [WORKER] - Partida ${matchId} processada e salva no banco de dados.`,
      );
    } catch (error) {
      if (error.code === 'P2002') {
        this.logger.warn(
          `Match ${matchId} was processed by another worker. Skipping.`,
        );
        return;
      }
      throw error;
    }
  }

  private async upsertChampionStats(
    patch: string,
    participant: MatchParticipant,
    gameDuration: number,
  ): Promise<void> {
    const {
      championId,
      win,
      kills,
      deaths,
      assists,
      totalDamageDealtToChampions,
      totalMinionsKilled,
      neutralMinionsKilled,
      goldEarned,
    } = participant;

    const totalCreepScore = totalMinionsKilled + neutralMinionsKilled;

    await this.prisma.championStats.upsert({
      where: { patch_championId: { patch, championId } },
      create: {
        patch,
        championId,
        gamesPlayed: 1,
        wins: win ? 1 : 0,
        totalKills: kills,
        totalDeaths: deaths,
        totalAssists: assists,
        totalDamageDealt: BigInt(totalDamageDealtToChampions),
        totalGoldEarned: BigInt(goldEarned),
        totalCreepScore: totalCreepScore,
        totalDuration: gameDuration,
      },
      update: {
        gamesPlayed: { increment: 1 },
        wins: { increment: win ? 1 : 0 },
        totalKills: { increment: kills },
        totalDeaths: { increment: deaths },
        totalAssists: { increment: assists },
        totalDamageDealt: { increment: BigInt(totalDamageDealtToChampions) },
        totalGoldEarned: { increment: BigInt(goldEarned) },
        totalCreepScore: { increment: totalCreepScore },
        totalDuration: { increment: gameDuration },
      },
    });
  }

  /**
   * Incrementa o contador de bans para um campeão
   * Se o campeão não existe nas stats, cria um registro apenas com o ban
   */
  private async incrementBanCount(
    patch: string,
    championId: number,
  ): Promise<void> {
    await this.prisma.championStats.upsert({
      where: { patch_championId: { patch, championId } },
      create: {
        patch,
        championId,
        gamesPlayed: 0,
        wins: 0,
        bans: 1,
      },
      update: {
        bans: { increment: 1 },
      },
    });
  }

  private async upsertMatchupStats(
    patch: string,
    matchup: MatchupData,
  ): Promise<void> {
    const { position, champion1, champion2, winner } = matchup;
    const championId1 = Math.min(champion1.id, champion2.id);
    const championId2 = Math.max(champion1.id, champion2.id);
    const champion1Won = winner.id === championId1;

    await this.prisma.matchupStats.upsert({
      where: {
        patch_championId1_championId2_role: {
          patch,
          championId1,
          championId2,
          role: position,
        },
      },
      create: {
        patch,
        championId1,
        championId2,
        role: position,
        gamesPlayed: 1,
        champion1Wins: champion1Won ? 1 : 0,
      },
      update: {
        gamesPlayed: { increment: 1 },
        champion1Wins: { increment: champion1Won ? 1 : 0 },
      },
    });
  }
}
