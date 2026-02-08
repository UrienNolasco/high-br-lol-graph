import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ParticipantData {
  puuid: string;
  championId: number;
  championName: string;
  role: string;
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  goldEarned: number;
  totalDamage: number;
  visionScore: number;
  goldGraph: number[];
  xpGraph: number[];
  csGraph: number[];
  damageGraph: number[];
}

@Injectable()
export class PlayerStatsAggregationService {
  private readonly logger = new Logger(PlayerStatsAggregationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async updatePlayerAggregates(
    participant: ParticipantData,
    opponent: ParticipantData | null,
    patch: string,
    gameDurationMinutes: number,
  ): Promise<void> {
    // Lifetime stats (patch = null)
    await this.updatePlayerStats(participant, null, gameDurationMinutes);
    await this.updatePlayerChampionStats(
      participant,
      opponent,
      null,
      gameDurationMinutes,
    );

    // Patch-specific stats
    await this.updatePlayerStats(participant, patch, gameDurationMinutes);
    await this.updatePlayerChampionStats(
      participant,
      opponent,
      patch,
      gameDurationMinutes,
    );
  }

  private async updatePlayerStats(
    participant: ParticipantData,
    patch: string | null,
    gameDurationMinutes: number,
  ): Promise<void> {
    // Prisma's composite unique type doesn't accept null for optional fields,
    // but the runtime behavior is correct. Cast to satisfy TypeScript.
    const patchValue = patch as string;

    const current = await this.prisma.playerStats.findUnique({
      where: {
        puuid_patch_queueId: {
          puuid: participant.puuid,
          patch: patchValue,
          queueId: 420,
        },
      },
    });

    const gamesPlayed = (current?.gamesPlayed || 0) + 1;
    const wins = (current?.wins || 0) + (participant.win ? 1 : 0);
    const losses = (current?.losses || 0) + (participant.win ? 0 : 1);
    const winRate = (wins / gamesPlayed) * 100;

    const weight = (current?.gamesPlayed || 0) / gamesPlayed;
    const newWeight = 1 / gamesPlayed;

    const avgKda =
      (current?.avgKda || 0) * weight + participant.kda * newWeight;
    const avgDpm =
      (current?.avgDpm || 0) * weight +
      (participant.totalDamage / gameDurationMinutes) * newWeight;
    const avgGpm =
      (current?.avgGpm || 0) * weight +
      (participant.goldEarned / gameDurationMinutes) * newWeight;
    const avgCspm =
      (current?.avgCspm || 0) * weight +
      ((participant.csGraph[participant.csGraph.length - 1] || 0) /
        gameDurationMinutes) *
        newWeight;
    const avgVisionScore =
      (current?.avgVisionScore || 0) * weight +
      participant.visionScore * newWeight;

    const roleDistribution =
      (current?.roleDistribution as Record<string, number>) || {};
    roleDistribution[participant.role] =
      (roleDistribution[participant.role] || 0) + 1;

    let topChampions =
      (current?.topChampions as Array<{
        championId: number;
        games: number;
        winRate: number;
      }>) || [];
    const champIndex = topChampions.findIndex(
      (c) => c.championId === participant.championId,
    );
    if (champIndex >= 0) {
      topChampions[champIndex].games++;
      topChampions[champIndex].winRate =
        (topChampions[champIndex].winRate *
          (topChampions[champIndex].games - 1) +
          (participant.win ? 100 : 0)) /
        topChampions[champIndex].games;
    } else {
      topChampions.push({
        championId: participant.championId,
        games: 1,
        winRate: participant.win ? 100 : 0,
      });
    }
    topChampions.sort((a, b) => b.games - a.games);
    topChampions = topChampions.slice(0, 5);

    await this.prisma.playerStats.upsert({
      where: {
        puuid_patch_queueId: {
          puuid: participant.puuid,
          patch: patchValue,
          queueId: 420,
        },
      },
      create: {
        puuid: participant.puuid,
        patch: patchValue,
        queueId: 420,
        gamesPlayed: 1,
        wins: participant.win ? 1 : 0,
        losses: participant.win ? 0 : 1,
        winRate: participant.win ? 100 : 0,
        avgKda: participant.kda,
        avgDpm: participant.totalDamage / gameDurationMinutes,
        avgCspm:
          (participant.csGraph[participant.csGraph.length - 1] || 0) /
          gameDurationMinutes,
        avgGpm: participant.goldEarned / gameDurationMinutes,
        avgVisionScore: participant.visionScore,
        roleDistribution: { [participant.role]: 1 },
        topChampions: [
          {
            championId: participant.championId,
            games: 1,
            winRate: participant.win ? 100 : 0,
          },
        ],
      },
      update: {
        gamesPlayed,
        wins,
        losses,
        winRate,
        avgKda,
        avgDpm,
        avgCspm,
        avgGpm,
        avgVisionScore,
        roleDistribution,
        topChampions,
        lastUpdated: new Date(),
      },
    });
  }

  private async updatePlayerChampionStats(
    participant: ParticipantData,
    opponent: ParticipantData | null,
    patch: string | null,
    gameDurationMinutes: number,
  ): Promise<void> {
    const patchValue = patch as string;

    const current = await this.prisma.playerChampionStats.findUnique({
      where: {
        puuid_championId_patch_queueId: {
          puuid: participant.puuid,
          championId: participant.championId,
          patch: patchValue,
          queueId: 420,
        },
      },
    });

    const gamesPlayed = (current?.gamesPlayed || 0) + 1;
    const wins = (current?.wins || 0) + (participant.win ? 1 : 0);
    const losses = (current?.losses || 0) + (participant.win ? 0 : 1);
    const winRate = (wins / gamesPlayed) * 100;

    const weight = (current?.gamesPlayed || 0) / gamesPlayed;
    const newWeight = 1 / gamesPlayed;

    const avgKda =
      (current?.avgKda || 0) * weight + participant.kda * newWeight;
    const avgDpm =
      (current?.avgDpm || 0) * weight +
      (participant.totalDamage / gameDurationMinutes) * newWeight;
    const avgGpm =
      (current?.avgGpm || 0) * weight +
      (participant.goldEarned / gameDurationMinutes) * newWeight;
    const avgCspm =
      (current?.avgCspm || 0) * weight +
      ((participant.csGraph[participant.csGraph.length - 1] || 0) /
        gameDurationMinutes) *
        newWeight;
    const avgVisionScore =
      (current?.avgVisionScore || 0) * weight +
      participant.visionScore * newWeight;

    let avgCsd15 = current?.avgCsd15 || 0;
    let avgGd15 = current?.avgGd15 || 0;
    let avgXpd15 = current?.avgXpd15 || 0;

    if (opponent) {
      const csd15 =
        (participant.csGraph[15] || 0) - (opponent.csGraph[15] || 0);
      const gd15 =
        (participant.goldGraph[15] || 0) - (opponent.goldGraph[15] || 0);
      const xpd15 =
        (participant.xpGraph[15] || 0) - (opponent.xpGraph[15] || 0);

      avgCsd15 = (current?.avgCsd15 || 0) * weight + csd15 * newWeight;
      avgGd15 = (current?.avgGd15 || 0) * weight + gd15 * newWeight;
      avgXpd15 = (current?.avgXpd15 || 0) * weight + xpd15 * newWeight;
    }

    const roleDistribution =
      (current?.roleDistribution as Record<string, number>) || {};
    roleDistribution[participant.role] =
      (roleDistribution[participant.role] || 0) + 1;

    await this.prisma.playerChampionStats.upsert({
      where: {
        puuid_championId_patch_queueId: {
          puuid: participant.puuid,
          championId: participant.championId,
          patch: patchValue,
          queueId: 420,
        },
      },
      create: {
        puuid: participant.puuid,
        championId: participant.championId,
        patch: patchValue,
        queueId: 420,
        gamesPlayed: 1,
        wins: participant.win ? 1 : 0,
        losses: participant.win ? 0 : 1,
        winRate: participant.win ? 100 : 0,
        avgKda: participant.kda,
        avgDpm: participant.totalDamage / gameDurationMinutes,
        avgCspm:
          (participant.csGraph[participant.csGraph.length - 1] || 0) /
          gameDurationMinutes,
        avgGpm: participant.goldEarned / gameDurationMinutes,
        avgVisionScore: participant.visionScore,
        avgCsd15: opponent
          ? (participant.csGraph[15] || 0) - (opponent.csGraph[15] || 0)
          : 0,
        avgGd15: opponent
          ? (participant.goldGraph[15] || 0) - (opponent.goldGraph[15] || 0)
          : 0,
        avgXpd15: opponent
          ? (participant.xpGraph[15] || 0) - (opponent.xpGraph[15] || 0)
          : 0,
        roleDistribution: { [participant.role]: 1 },
        lastPlayedAt: new Date(),
      },
      update: {
        gamesPlayed,
        wins,
        losses,
        winRate,
        avgKda,
        avgDpm,
        avgCspm,
        avgGpm,
        avgVisionScore,
        avgCsd15,
        avgGd15,
        avgXpd15,
        roleDistribution,
        lastPlayedAt: new Date(),
      },
    });
  }

  findLaneOpponent(
    participants: ParticipantData[],
    currentParticipant: ParticipantData,
  ): ParticipantData | null {
    return (
      participants.find(
        (p) =>
          p.role === currentParticipant.role &&
          p.teamId !== currentParticipant.teamId,
      ) || null
    );
  }
}
