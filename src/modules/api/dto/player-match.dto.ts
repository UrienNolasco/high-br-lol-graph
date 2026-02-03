import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para representar uma partida na lista de histórico do jogador
 * Versão LEVE (sem gráficos de timeline) para otimizar payload mobile
 */
export class PlayerMatchDto {
  @ApiProperty({ description: 'ID da partida' })
  matchId: string;

  @ApiProperty({
    description: 'Timestamp de criação da partida (BigInt convertido para String)',
  })
  gameCreation: string;

  @ApiProperty({ description: 'Duração da partida em segundos' })
  gameDuration: number;

  @ApiProperty({ description: 'ID do campeão' })
  championId: number;

  @ApiProperty({ description: 'Nome do campeão' })
  championName: string;

  @ApiProperty({ description: 'Resultado da partida' })
  win: boolean;

  @ApiProperty({ description: 'Abates' })
  kills: number;

  @ApiProperty({ description: 'Mortes' })
  deaths: number;

  @ApiProperty({ description: 'Assistências' })
  assists: number;

  @ApiProperty({ description: 'KDA calculado' })
  kda: number;

  @ApiProperty({ description: 'ID da fila (420=Ranked Solo, 440=Ranked Flex)' })
  queueId: number;
}

/**
 * DTO de resposta para lista de partidas do jogador
 */
export class PlayerMatchesDto {
  @ApiProperty({ description: 'Lista de partidas', type: [PlayerMatchDto] })
  data: PlayerMatchDto[];

  @ApiProperty({ description: 'Cursor para próxima página (se houver mais dados)' })
  nextCursor?: string;
}
