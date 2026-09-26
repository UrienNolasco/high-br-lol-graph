import { ApiProperty } from '@nestjs/swagger';
import type {
  EventQuality,
  NormalizedTimelineEvent,
} from '../../../modules/matches/contracts/normalized-events';

export class NormalizedTimelineEventDto implements NormalizedTimelineEvent {
  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    description: 'Preenchido na persistência da projeção',
  })
  processedAt?: string;
  @ApiProperty({ example: 'BR1_3200579475' })
  matchId: string;

  @ApiProperty({
    example: 1,
    description: 'Índice original do frame (base zero), parte da identidade',
  })
  frameIndex: number;

  @ApiProperty({
    example: 0,
    description:
      'Índice original no frame (base zero), preserva timestamps iguais',
  })
  eventIndex: number;

  @ApiProperty({ type: String, nullable: true, example: 'WARD_PLACED' })
  type: string | null;

  @ApiProperty({ type: Number, nullable: true })
  timestampMs: number | null;

  @ApiProperty({ type: Number, nullable: true })
  frameTimestampMs: number | null;

  @ApiProperty({ type: Number, nullable: true })
  actorParticipantId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  victimParticipantId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  sourceTeamId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  ownerTeamId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  beneficiaryTeamId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  positionX: number | null;

  @ApiProperty({ type: Number, nullable: true })
  positionY: number | null;

  @ApiProperty({ type: String, nullable: true })
  actorPuuid: string | null;

  @ApiProperty({ type: String, nullable: true })
  victimPuuid: string | null;

  @ApiProperty({ type: String, nullable: true })
  lane: string | null;

  @ApiProperty({ type: String, nullable: true })
  tier: string | null;

  @ApiProperty({
    type: [Number],
    nullable: true,
    description: 'null se não informado; [] se observado vazio',
  })
  assistingParticipantIds: number[] | null;

  @ApiProperty({
    type: 'array',
    nullable: true,
    items: { type: 'string', nullable: true },
    description: 'Alinhado aos IDs; null por PUUID não resolvido',
  })
  assistingPuuids: (string | null)[] | null;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    description:
      'Evento original completo, inclusive recaps magicDamage, campos extras e tipos futuros',
  })
  payload: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    description:
      'unknownType, missingFields, invalidFields, sentinelFields, unresolvedParticipantIds e conflicts',
    example: {
      unknownType: false,
      missingFields: ['position.x', 'position.y'],
      invalidFields: [],
      sentinelFields: [],
      unresolvedParticipantIds: [],
      conflicts: [],
    },
  })
  quality: EventQuality;

  @ApiProperty({ example: 1 })
  metricVersion: number;

  @ApiProperty({ example: 2 })
  processingVersion: number;
}
