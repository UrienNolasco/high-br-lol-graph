import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

// ========== Query DTO ==========

export class CompareQueryDto {
  @ApiProperty({ description: 'PUUID do jogador principal (herói)' })
  @IsString()
  heroPuuid: string;

  @ApiProperty({ description: 'PUUID do jogador oponente (vilão)' })
  @IsString()
  villainPuuid: string;

  @ApiProperty({
    required: false,
    enum: ['TOP', 'JUNGLE', 'MID', 'BOTTOM', 'UTILITY'],
    description: 'Filtrar por role',
  })
  @IsOptional()
  @IsIn(['TOP', 'JUNGLE', 'MID', 'BOTTOM', 'UTILITY'])
  role?: string;

  @ApiProperty({ required: false, description: 'Filtrar por campeão (ID)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  championId?: number;

  @ApiProperty({
    required: false,
    default: 'lifetime',
    description: 'Filtrar por patch (ex: 15.19) ou "lifetime" para todos',
  })
  @IsOptional()
  @IsString()
  patch?: string = 'lifetime';
}

// ========== Response DTOs ==========

export class ComparePlayerStatsDto {
  @ApiProperty({ example: 50, description: 'Total de partidas jogadas' })
  gamesPlayed: number;

  @ApiProperty({ example: 54.5, description: 'Taxa de vitória (%)' })
  winRate: number;

  @ApiProperty({ example: 3.2, description: 'KDA médio' })
  avgKda: number;

  @ApiProperty({ example: 7.5, description: 'CS por minuto médio' })
  avgCspm: number;

  @ApiProperty({ example: 620.3, description: 'Dano por minuto médio' })
  avgDpm: number;

  @ApiProperty({ example: 410.8, description: 'Ouro por minuto médio' })
  avgGpm: number;

  @ApiProperty({ example: 28.5, description: 'Score de visão médio' })
  avgVisionScore: number;
}

export class LaningPhaseDto {
  @ApiProperty({
    example: 8.5,
    description: 'Diferença média de CS aos 15 min',
  })
  avgCsd15: number;

  @ApiProperty({
    example: 350,
    description: 'Diferença média de ouro aos 15 min',
  })
  avgGd15: number;

  @ApiProperty({
    example: 120,
    description: 'Diferença média de XP aos 15 min',
  })
  avgXpd15: number;

  @ApiProperty({ example: 0, description: 'Solo kills antes dos 15 min' })
  soloKills15: number;

  @ApiProperty({ example: 0, description: 'Solo deaths antes dos 15 min' })
  soloDeaths15: number;
}

export class ComparePlayerDto {
  @ApiProperty({ example: 'abc123def456', description: 'PUUID do jogador' })
  puuid: string;

  @ApiProperty({ example: 'PlayerName', description: 'Nome no jogo' })
  gameName: string;

  @ApiProperty({
    type: ComparePlayerStatsDto,
    description: 'Estatísticas agregadas do jogador',
  })
  stats: ComparePlayerStatsDto;

  @ApiProperty({
    type: LaningPhaseDto,
    description: 'Métricas da fase de lane',
  })
  laningPhase: LaningPhaseDto;
}

export class TimelinePointDto {
  @ApiProperty({ example: 5, description: 'Minuto da partida' })
  minute: number;

  @ApiProperty({ example: 3200, description: 'Valor no minuto' })
  value: number;
}

export class TimelineGraphDto {
  @ApiProperty({ type: [TimelinePointDto], description: 'Timeline do herói' })
  hero: TimelinePointDto[];

  @ApiProperty({ type: [TimelinePointDto], description: 'Timeline do vilão' })
  villain: TimelinePointDto[];
}

export class TimelineComparisonDto {
  @ApiProperty({
    type: TimelineGraphDto,
    description: 'Gráfico de CS médio por minuto',
  })
  csGraph: TimelineGraphDto;

  @ApiProperty({
    type: TimelineGraphDto,
    description: 'Gráfico de ouro médio por minuto',
  })
  goldGraph: TimelineGraphDto;
}

export class CompareInsightsDto {
  @ApiProperty({
    example: 'hero',
    enum: ['hero', 'villain'],
    description: 'Jogador com melhor desempenho geral',
  })
  winner: 'hero' | 'villain';

  @ApiProperty({
    example: ['Herói tem 15% mais CS/min', 'Vilão tem melhor vision score'],
    description: 'Vantagens identificadas',
  })
  advantages: string[];

  @ApiProperty({
    example: ['Herói deve melhorar vision score', 'Vilão deve melhorar farm'],
    description: 'Recomendações de melhoria',
  })
  recommendations: string[];
}

export class PlayerComparisonDto {
  @ApiProperty({
    type: ComparePlayerDto,
    description: 'Dados do herói (jogador principal)',
  })
  hero: ComparePlayerDto;

  @ApiProperty({
    type: ComparePlayerDto,
    description: 'Dados do vilão (oponente)',
  })
  villain: ComparePlayerDto;

  @ApiProperty({
    type: TimelineComparisonDto,
    description: 'Comparação de timelines (CS e ouro)',
  })
  timelineComparison: TimelineComparisonDto;

  @ApiProperty({
    type: CompareInsightsDto,
    description: 'Insights automáticos da comparação',
  })
  insights: CompareInsightsDto;
}
