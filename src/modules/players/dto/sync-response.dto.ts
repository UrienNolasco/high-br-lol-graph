import { ApiProperty } from '@nestjs/swagger';

export enum SyncStatus {
  IDLE = 'IDLE',
  SYNCING = 'SYNCING',
  DONE = 'DONE',
  ERROR = 'ERROR',
}

export class SyncTriggerResponseDto {
  @ApiProperty({ example: 'BhDoHm...' })
  puuid: string;

  @ApiProperty({ enum: SyncStatus, example: SyncStatus.SYNCING })
  status: SyncStatus;

  @ApiProperty({ example: 42 })
  matchesEnqueued: number;

  @ApiProperty({ example: 100 })
  matchesTotal: number;

  @ApiProperty({ example: 58 })
  matchesAlreadyInDb: number;

  @ApiProperty({ example: 'Deep sync started: 42 matches enqueued' })
  message: string;
}

export class SyncStatusResponseDto {
  @ApiProperty({ example: 'BhDoHm...' })
  puuid: string;

  @ApiProperty({ enum: SyncStatus, example: SyncStatus.SYNCING })
  status: SyncStatus;

  @ApiProperty({ example: 30 })
  matchesProcessed: number;

  @ApiProperty({ example: 42 })
  matchesTotal: number;

  @ApiProperty({ example: '2026-03-03T12:00:00.000Z', nullable: true })
  startedAt: string | null;

  @ApiProperty({ example: 'Sync in progress: 30/42 matches processed' })
  message: string;
}
