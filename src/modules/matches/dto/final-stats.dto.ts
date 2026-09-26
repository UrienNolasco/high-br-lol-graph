import { ApiProperty } from '@nestjs/swagger';
import {
  FINAL_STAT_UNITS,
  FINAL_FLAG_FIELDS,
  FINAL_OBJECTIVE_TYPES,
} from '../contracts/final-stats';
import type { FinalStatField, FinalFlagField } from '../contracts/final-stats';

export class FinalProjectionQualityDto {
  @ApiProperty({ example: 58 }) validFields: number;
  @ApiProperty({ example: 59 }) totalFields: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Campos observados válidos / campos projetados; não mede cobertura temporal.',
  })
  coverage: number | null;
}

export class FinalProjectionDto {
  @ApiProperty({ example: 1 }) projectionVersion: number;
  @ApiProperty({ description: 'Caminho no resumo bruto preservado.' })
  source: string;
  @ApiProperty({
    example: 'observed',
    description:
      'Projeção literal; campos null permanecem indisponíveis com motivo individual.',
  })
  origin: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: {
      type: 'string',
      enum: ['missing_field', 'invalid_value'],
    },
  })
  missingReasons: Record<string, string>;
  @ApiProperty({ type: FinalProjectionQualityDto })
  quality: FinalProjectionQualityDto;
}

export class FinalParticipantStatsDto extends FinalProjectionDto {
  @ApiProperty({
    type: 'object',
    required: [...Object.keys(FINAL_STAT_UNITS), ...FINAL_FLAG_FIELDS],
    properties: Object.fromEntries([
      ...Object.entries(FINAL_STAT_UNITS).map(([field, unit]) => [
        field,
        {
          type: 'number',
          nullable: true,
          description: `Campo Match-V5 ${field}, unidade ${unit}; null usa missingReasons.${field}.`,
        },
      ]),
      ...FINAL_FLAG_FIELDS.map((field) => [
        field,
        {
          type: 'boolean',
          nullable: true,
          description:
            'Flag observado no participante, sem inferência de remake por duração.',
        },
      ]),
    ]),
  })
  values: Record<FinalStatField, number | null> &
    Record<FinalFlagField, boolean | null>;
}

const objectiveSchema = {
  type: 'object' as const,
  nullable: true,
  required: ['first', 'kills', 'lost'],
  properties: {
    first: { type: 'boolean' as const, nullable: true },
    kills: {
      type: 'number' as const,
      nullable: true,
      description:
        'Total final observado, unidade count; não reconta a timeline.',
    },
    lost: { type: 'boolean' as const, nullable: true },
  },
};
export class FinalObjectivesDto extends FinalProjectionDto {
  @ApiProperty({
    type: 'object',
    required: [...FINAL_OBJECTIVE_TYPES],
    properties: Object.fromEntries(
      FINAL_OBJECTIVE_TYPES.map((type) => [type, objectiveSchema]),
    ),
    additionalProperties: objectiveSchema,
  })
  values: Record<
    string,
    { first: boolean | null; kills: number | null; lost: boolean | null } | null
  >;
  @ApiProperty({
    type: [String],
    description:
      'Tipos além do catálogo inicial preservados pelo nome, sem atribuição semântica.',
  })
  unknownTypes: string[];
}

export class FinalMatchContextDto extends FinalProjectionDto {
  @ApiProperty({
    type: 'object',
    required: [
      'gameStartTimestamp',
      'gameEndTimestamp',
      'gameId',
      'platformId',
      'gameType',
      'endOfGameResult',
      'tournamentCode',
    ],
    properties: {
      gameStartTimestamp: {
        type: 'number',
        nullable: true,
        description: 'Epoch milliseconds do resumo.',
      },
      gameEndTimestamp: {
        type: 'number',
        nullable: true,
        description: 'Epoch milliseconds do resumo.',
      },
      gameId: { type: 'number', nullable: true },
      platformId: { type: 'string', nullable: true },
      gameType: { type: 'string', nullable: true },
      endOfGameResult: { type: 'string', nullable: true },
      tournamentCode: { type: 'string', nullable: true },
    },
  })
  values: Record<string, number | string | boolean | null>;
}
