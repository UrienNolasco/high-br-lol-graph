import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  Matches,
} from 'class-validator';

// ========== Query DTO ==========

export class CompareQueryDto {
  @ApiProperty({ description: 'PUUID do jogador' })
  @IsString()
  heroPuuid: string;

  @ApiProperty({ description: 'PUUID do jogador oponente' })
  @IsString()
  villainPuuid: string;

  @ApiProperty({
    required: false,
    enum: ['TOP', 'JUNGLE', 'MID', 'MIDDLE', 'BOTTOM', 'UTILITY'],
    description: 'Filtrar por role',
  })
  @IsOptional()
  @IsIn(['TOP', 'JUNGLE', 'MID', 'MIDDLE', 'BOTTOM', 'UTILITY'])
  role?: string;

  @ApiProperty({ required: false, description: 'Filtrar por campeão (ID)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  championId?: number;

  @ApiProperty({
    required: false,
    default: 'ALL',
    description: 'Filtrar por patch (ex: 15.19) ou "ALL" para todos',
  })
  @IsOptional()
  @Matches(/^(ALL|\d+\.\d+)$/)
  patch?: string = 'ALL';
  @ApiProperty({
    required: false,
    default: 420,
    description: 'Fila da mesma coorte para todas as seções',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  queueId?: number = 420;

  @ApiProperty({ required: false, description: 'Início inclusivo em Unix ms' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  startDate?: number;

  @ApiProperty({ required: false, description: 'Fim exclusivo em Unix ms' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  endDate?: number;

  @ApiProperty({ required: false, default: 100, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 100;
}

// ========== Response DTOs ==========

export class ComparePlayerStatsDto {
  @ApiProperty({ example: 50, description: 'Total de partidas jogadas' })
  gamesPlayed: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 54.5,
    description: 'Taxa de vitória (%)',
  })
  winRate: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3.2,
    description: 'KDA médio',
  })
  avgKda: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 7.5,
    description: 'CS por minuto médio',
  })
  avgCspm: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 620.3,
    description: 'Dano por minuto médio',
  })
  avgDpm: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 410.8,
    description: 'Ouro por minuto médio',
  })
  avgGpm: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 28.5,
    description: 'Score de visão médio',
  })
  avgVisionScore: number | null;

  @ApiProperty({
    type: Object,
    description:
      'N válido, N total, cobertura, valor e motivo por medida; médias por partida, sem arredondamento',
  })
  samples?: Record<string, unknown>;
}

export class LaningPhaseDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 8.5,
    description: 'Diferença média de CS aos 15 min',
  })
  avgCsd15: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 350,
    description: 'Diferença média de ouro aos 15 min',
  })
  avgGd15: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 120,
    description: 'Diferença média de XP aos 15 min',
  })
  avgXpd15: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 0,
    description: 'Solo kills antes dos 15 min',
  })
  soloKills15: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 0,
    description: 'Solo deaths antes dos 15 min',
  })
  soloDeaths15: number | null;

  @ApiProperty({ example: 'not_calculated' })
  soloKills15Reason?: string;
  @ApiProperty({ example: 'not_calculated' })
  soloDeaths15Reason?: string;
  @ApiProperty({
    type: Object,
    description: 'N próprio de CS, ouro e XP; somente pares com campos válidos',
  })
  samples?: Record<string, unknown>;
  @ApiProperty({
    type: Object,
    example: { targetMs: 900000, mode: 'nearest', toleranceMs: 60000 },
  })
  checkpoint?: object;
  @ApiProperty({
    type: [Object],
    description:
      'Partida, adversário, timestamp real, offset, diferenças e motivo de ausência',
  })
  evidence?: object[];
}

export class ComparePlayerDto {
  @ApiProperty({ example: 'abc123def456', description: 'PUUID do jogador' })
  puuid: string;

  @ApiProperty({ example: 'PlayerName', description: 'Nome no jogo' })
  gameName: string;

  @ApiProperty({
    type: Object,
    description:
      'Filtros efetivos, matchIds ordenados, eligibleN, returnedN, limit, truncated; população comum a todas as medidas',
  })
  cohort?: object;

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

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3200,
    description: 'Média no checkpoint; null sem amostras válidas',
  })
  value: number | null;
  @ApiProperty({ example: 14 })
  validN?: number;
  @ApiProperty({ example: 20 })
  totalN?: number;
  @ApiProperty({ type: Number, nullable: true, example: 0.7 })
  coverage?: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'no_valid_samples' })
  reason?: string | null;
  @ApiProperty({
    type: [Object],
    description: 'matchId, timestampMs e offsetMs dos frames contribuintes',
  })
  evidence?: object[];
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
    nullable: true,
    description: 'Jogador com melhor desempenho geral',
  })
  winner: 'hero' | 'villain' | null;

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
    example: 1,
    description:
      'Versão MET-08: coorte única, ausência explícita, timestamps observados',
  })
  metricVersion?: number;
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
