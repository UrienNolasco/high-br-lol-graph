import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// ========== Query DTO ==========

export class PlayerMatchesQueryDto {
  @ApiProperty({ required: false, default: 420, description: 'Queue ID (420=Ranked Solo, 440=Ranked Flex)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  queueId?: number = 420;

  @ApiProperty({ required: false, description: 'Filter by champion ID' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  championId?: number;

  @ApiProperty({ required: false, enum: ['TOP', 'JUNGLE', 'MID', 'BOTTOM', 'UTILITY'], description: 'Filter by role' })
  @IsOptional()
  @IsIn(['TOP', 'JUNGLE', 'MID', 'BOTTOM', 'UTILITY'])
  role?: string;

  @ApiProperty({ required: false, description: 'Cursor for pagination (matchId of last match)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 50, description: 'Number of matches to return' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiProperty({ required: false, description: 'Start date filter (timestamp in ms)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  startDate?: number;

  @ApiProperty({ required: false, description: 'End date filter (timestamp in ms)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  endDate?: number;

  @ApiProperty({ required: false, enum: ['win', 'loss'], description: 'Filter by match result' })
  @IsOptional()
  @IsIn(['win', 'loss'])
  result?: 'win' | 'loss';

  @ApiProperty({ required: false, enum: ['recent', 'kda', 'kills', 'damage'], default: 'recent', description: 'Sort order' })
  @IsOptional()
  @IsIn(['recent', 'kda', 'kills', 'damage'])
  sortBy?: 'recent' | 'kda' | 'kills' | 'damage' = 'recent';
}

// ========== Page Query DTO ==========

export class PlayerMatchesPageQueryDto extends PlayerMatchesQueryDto {
  @ApiProperty({ required: false, default: 1, minimum: 1, description: 'Page number (1-indexed)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;
}

// ========== Response DTOs ==========

/**
 * DTO para representar uma partida na lista de histórico do jogador
 * Versão LEVE (sem gráficos de timeline) para otimizar payload mobile
 */
export class PlayerMatchDto {
  @ApiProperty({ example: 'BR1_3216549870', description: 'ID da partida' })
  matchId: string;

  @ApiProperty({ example: 157, description: 'ID do campeão' })
  championId: number;

  @ApiProperty({ example: 'Yasuo', description: 'Nome do campeão' })
  championName: string;

  @ApiProperty({ example: 'MID', description: 'Role primária (TOP, JUNGLE, MID, BOTTOM, UTILITY)' })
  role: string;

  @ApiProperty({ example: 'MIDDLE', description: 'Lane específica' })
  lane: string;

  @ApiProperty({ example: 10, description: 'Abates' })
  kills: number;

  @ApiProperty({ example: 3, description: 'Mortes' })
  deaths: number;

  @ApiProperty({ example: 8, description: 'Assistências' })
  assists: number;

  @ApiProperty({ example: 6.0, description: 'KDA calculado' })
  kda: number;

  @ApiProperty({ example: 15420, description: 'Ouro total ganho' })
  goldEarned: number;

  @ApiProperty({ example: 28500, description: 'Dano total causado a campeões' })
  totalDamage: number;

  @ApiProperty({ example: 25, description: 'Score de visão' })
  visionScore: number;

  @ApiProperty({ example: 8.1, description: 'Farm por minuto' })
  cspm: number;

  @ApiProperty({ example: true, description: 'Resultado da partida' })
  win: boolean;

  @ApiProperty({ example: 1738752000000, description: 'Timestamp de criação da partida (ms)' })
  gameCreation: number;

  @ApiProperty({ example: 1845, description: 'Duração da partida em segundos' })
  gameDuration: number;

  @ApiProperty({ example: 420, description: 'ID da fila (420=Ranked Solo, 440=Ranked Flex)' })
  queueId: number;
}

/**
 * DTO de resposta para lista de partidas do jogador
 */
export class PlayerMatchesDto {
  @ApiProperty({ example: 'abc123def456', description: 'PUUID do jogador' })
  puuid: string;

  @ApiProperty({ description: 'Lista de partidas', type: [PlayerMatchDto] })
  matches: PlayerMatchDto[];

  @ApiProperty({ example: 'BR1_3216549869', nullable: true, description: 'Cursor para próxima página' })
  nextCursor: string | null;

  @ApiProperty({ example: true, description: 'Indica se há mais partidas' })
  hasMore: boolean;
}
