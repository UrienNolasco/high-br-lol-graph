import { IsString, IsOptional } from 'class-validator';

export class ProcessMatchDto {
  @IsString()
  matchId: string;

  @IsOptional()
  @IsString()
  traceId?: string;
}
