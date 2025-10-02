import { Injectable } from '@nestjs/common';

// Interfaces para type safety
export interface MatchParticipant {
  puuid: string;
  championId: number;
  championName: string;
  teamId: number;
  position: string;
  win: boolean;
}

export interface ChampionInfo {
  id: number;
  name: string;
}

export interface MatchupData {
  position: string;
  champion1: ChampionInfo; // Representa o campeão do time 100 (Blue)
  champion2: ChampionInfo; // Representa o campeão do time 200 (Red)
  winner: ChampionInfo;
}

export interface ParsedMatchData {
  patch: string;
  winningTeamId: number;
  participants: MatchParticipant[];
  matchups: MatchupData[];
}

interface RiotParticipant {
  puuid: string;
  championId: number;
  championName: string;
  teamId: number;
  individualPosition: string;
  win: boolean;
}

interface RiotMatchDto {
  info: {
    gameVersion: string;
    participants: RiotParticipant[];
  };
}

@Injectable()
export class MatchParserService {
  /**
   * Parseia o payload completo da Riot API para extrair apenas dados essenciais
   * Otimizado para performance com apenas uma iteração sobre os participantes
   */
  parseMatchData(matchDto: RiotMatchDto): ParsedMatchData {
    const { gameVersion, participants } = matchDto.info;

    // Extrai patch (apenas versão principal, ex: "15.19")
    const patch = this.extractPatch(gameVersion);

    // Determina team vencedor (pode ser extraído do primeiro participante que venceu)
    const winningTeamId = participants.find((p) => p.win)?.teamId || 0;

    // Maps para agrupar por posição (evita múltiplas iterações)
    const blueTeamByPosition = new Map<string, RiotParticipant>();
    const redTeamByPosition = new Map<string, RiotParticipant>();

    // Array simplificado de participantes
    const simplifiedParticipants: MatchParticipant[] = [];

    // Uma única iteração: popula tudo simultaneamente
    for (const participant of participants) {
      // Adiciona ao array simplificado
      simplifiedParticipants.push({
        puuid: participant.puuid,
        championId: participant.championId,
        championName: participant.championName,
        teamId: participant.teamId,
        position: participant.individualPosition,
        win: participant.win,
      });

      // Agrupa por time e posição para matchups
      const position = participant.individualPosition;
      if (participant.teamId === 100) {
        blueTeamByPosition.set(position, participant);
      } else {
        redTeamByPosition.set(position, participant);
      }
    }

    // Cria matchups (máximo 5 posições)
    const matchups = this.buildMatchups(blueTeamByPosition, redTeamByPosition);

    return {
      patch,
      winningTeamId,
      participants: simplifiedParticipants,
      matchups,
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
    blueTeam: Map<string, RiotParticipant>,
    redTeam: Map<string, RiotParticipant>,
  ): MatchupData[] {
    const matchups: MatchupData[] = [];
    const positions = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

    for (const position of positions) {
      const bluePlayer = blueTeam.get(position);
      const redPlayer = redTeam.get(position);

      // Verifica se ambos os jogadores existem na posição
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
