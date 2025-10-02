import { IsString } from 'class-validator';

export class ProcessMatchDto {
  @IsString()
  matchId: string;

  @IsString()
  patch: string;
}
