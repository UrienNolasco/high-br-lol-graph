import { ApiProperty } from '@nestjs/swagger';

export class ParticipantSnapshotDto {
  @ApiProperty({ example: 1 }) participantId: number;
  @ApiProperty({ type: String, nullable: true }) puuid: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 0 }) totalGold:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) currentGold: number | null;
  @ApiProperty({ type: Number, nullable: true }) xp: number | null;
  @ApiProperty({ type: Number, nullable: true }) level: number | null;
  @ApiProperty({ type: Number, nullable: true }) minionsKilled: number | null;
  @ApiProperty({ type: Number, nullable: true }) jungleMinionsKilled:
    | number
    | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    properties: {
      x: { type: 'number', nullable: true },
      y: { type: 'number', nullable: true },
    },
  })
  position: { x: number | null; y: number | null } | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: { type: 'number', nullable: true },
    description:
      'Complete known damage fields plus future numeric stat keys; absence is null.',
  })
  damageStats: Record<string, number | null> | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: { type: 'number', nullable: true },
  })
  championStats: Record<string, number | null> | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Other original participant-frame fields, without interpretation.',
  })
  additionalFields: Record<string, unknown>;
  @ApiProperty({ type: [String], example: ['currentGold'] })
  missingFields: string[];
}

export class SnapshotFrameDto {
  @ApiProperty({ example: 40 }) frameIndex: number;
  @ApiProperty({ type: Number, nullable: true, example: 2368922 }) timestamp:
    | number
    | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: {
      $ref: '#/components/schemas/ParticipantSnapshotDto',
    },
  })
  participantFrames: Record<string, ParticipantSnapshotDto>;
}

export class TimelineSnapshotProjectionDto {
  @ApiProperty({ example: 1 }) projectionVersion: number;
  @ApiProperty({ type: Number, nullable: true, example: 60000 })
  frameIntervalMs: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 2368922 })
  observedEndMs: number | null;
  @ApiProperty({ type: [SnapshotFrameDto] }) frames: SnapshotFrameDto[];
}
