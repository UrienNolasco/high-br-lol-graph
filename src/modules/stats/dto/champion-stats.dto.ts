import { ApiProperty } from '@nestjs/swagger';
import type { ChampionImages } from '../contracts/champion-images';

export class ChampionStatsDto {
  @ApiProperty({ type: String, nullable: true, example: 'Aatrox' })
  championName: string | null;

  @ApiProperty({ example: 266 })
  championId: number;

  @ApiProperty({ type: Number, nullable: true, example: 55.7 })
  winRate: number | null;

  @ApiProperty({ example: 1234 })
  gamesPlayed: number;

  @ApiProperty({ type: Number, nullable: true, example: 687 })
  wins: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 547 })
  losses: number | null;

  @ApiProperty({ type: 'object', additionalProperties: false, nullable: true })
  images: ChampionImages | null;

  @ApiProperty({ type: Number, nullable: true, example: 2.5 })
  kda: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 650.3 })
  dpm: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 7.2 })
  cspm: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 450.8 })
  gpm: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 15.5,
    description:
      '100 × distinct matches banning champion / eligible matches. Null if bans coverage incomplete.',
  })
  banRate: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 12.3,
    description: '100 × distinct matches picking champion / eligible matches.',
  })
  pickRate: number | null;

  @ApiProperty({ example: 'H07' }) metricId?: string;
  @ApiProperty({ example: 1 }) metricVersion?: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Descriptive tier heuristic; null when inputs/sample are insufficient.',
  })
  score?: number | null;
  @ApiProperty({ example: true }) hasInsufficientData?: boolean;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    example: {
      performance: 'no_picks',
      banRate: null,
      pickRate: null,
      catalog: 'missing_catalog',
      tier: 'missing_metric',
    },
  })
  availability?: Record<string, string | null>;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Eligible distinct match N, selected/excluded N and reasons, picked/banned match counts, known-ban/performance sample N, exact patch/queue/map.',
  })
  population?: Record<string, unknown>;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Versioned heuristic formula, thresholds, sample weights and observed previous patch; not statistical confidence.',
  })
  tierMethod?: Record<string, unknown>;

  @ApiProperty({
    example: 'A',
    description: 'Tier do campeão (S+, S, A, B, C, D ou "Dados Insuficientes")',
    enum: ['S+', 'S', 'A', 'B', 'C', 'D', 'Dados Insuficientes'],
  })
  tier: string;

  @ApiProperty({
    example: 5,
    description:
      'Rank da heurística na coorte de patch/fila, sem ajuste de posição; null = dados insuficientes',
    nullable: true,
  })
  rank: number | null;

  @ApiProperty({
    example: 'TOP',
    description:
      'Role primária do campeão no patch (inferida baseada nos matchups)',
    nullable: true,
  })
  primaryRole?: string;
}

export class PaginatedChampionStatsDto {
  @ApiProperty({ type: 'object', additionalProperties: true }) cohort?: Record<
    string,
    unknown
  >;
  @ApiProperty({ type: 'object', additionalProperties: true })
  tierMethod?: Record<string, unknown>;
  @ApiProperty({ type: [ChampionStatsDto] })
  data: ChampionStatsDto[];

  @ApiProperty({ example: 10 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}
