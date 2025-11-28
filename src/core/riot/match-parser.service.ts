import { Injectable } from '@nestjs/common';
import { MatchDto, ParticipantDto } from './dto/match.dto';

export interface MatchParticipant {
  puuid: string;
  championId: number;
  championName: string;
  teamId: number;
  position: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalDamageDealtToChampions: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
}

export interface ChampionInfo {
  id: number;
  name: string;
}

export interface MatchupData {
  position: string;
  champion1: ChampionInfo;
  champion2: ChampionInfo;
  winner: ChampionInfo;
}

export interface ParsedMatchData {
  patch: string;
  winningTeamId: number;
  participants: MatchParticipant[];
  matchups: MatchupData[];
  gameDuration: number;
}

@Injectable()
export class MatchParserService {
  /**
   * Parseia o payload completo da Riot API para extrair apenas dados essenciais
   * Otimizado para performance com apenas uma iteração sobre os participantes
   */
  parseMatchData(matchDto: MatchDto): ParsedMatchData {
    const { gameVersion, gameDuration, participants } = matchDto.info;

    const patch = this.extractPatch(gameVersion);
    const winningTeamId = participants.find((p) => p.win)?.teamId || 0;

    const blueTeamByPosition = new Map<string, ParticipantDto>();
    const redTeamByPosition = new Map<string, ParticipantDto>();

    const simplifiedParticipants: MatchParticipant[] = [];

    for (const participant of participants) {
      simplifiedParticipants.push({
        puuid: participant.puuid,
        championId: participant.championId,
        championName: participant.championName,
        teamId: participant.teamId,
        position: participant.individualPosition,
        win: participant.win,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
        totalMinionsKilled: participant.totalMinionsKilled,
        neutralMinionsKilled: participant.neutralMinionsKilled,
        goldEarned: participant.goldEarned,
      });

      const position = participant.individualPosition;
      if (participant.teamId === 100) {
        blueTeamByPosition.set(position, participant);
      } else {
        redTeamByPosition.set(position, participant);
      }
    }

    const matchups = this.buildMatchups(blueTeamByPosition, redTeamByPosition);

    return {
      patch,
      winningTeamId,
      participants: simplifiedParticipants,
      matchups,
      gameDuration,
    };
  }

  /**
   * Extrai versão principal do patch (ex: "15.19.715.1836" -> "15.19")
   */
  private extractPatch(gameVersion: string): string {
    const parts = gameVersion.split('.');
    return `${parts[0]}.${parts[1]}`;
  }

  /**
   * Constrói array de matchups a partir dos Maps de participantes
   */
  private buildMatchups(
    blueTeam: Map<string, ParticipantDto>,
    redTeam: Map<string, ParticipantDto>,
  ): MatchupData[] {
    const matchups: MatchupData[] = [];
    const positions = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

    for (const position of positions) {
      const bluePlayer = blueTeam.get(position);
      const redPlayer = redTeam.get(position);

      if (bluePlayer && redPlayer) {
        const bluePlayerInfo = {
          id: bluePlayer.championId,
          name: bluePlayer.championName,
        };
        const redPlayerInfo = {
          id: redPlayer.championId,
          name: redPlayer.championName,
        };

        matchups.push({
          position,
          champion1: bluePlayerInfo,
          champion2: redPlayerInfo,
          winner: bluePlayer.win ? bluePlayerInfo : redPlayerInfo,
        });
      }
    }

    return matchups;
  }
}
