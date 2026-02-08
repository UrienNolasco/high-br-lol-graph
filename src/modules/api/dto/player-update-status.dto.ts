export enum UpdateStatus {
  IDLE = 'IDLE',
  UPDATING = 'UPDATING',
  ERROR = 'ERROR',
}

export class PlayerUpdateStatusDto {
  status: UpdateStatus;
  matchesProcessed: number;
  matchesTotal: number;
  queuePosition?: number;
  estimatedCompletion?: Date;
  message: string;
}
