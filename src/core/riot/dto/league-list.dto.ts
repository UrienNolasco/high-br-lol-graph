import { LeagueEntryDto } from './league-entry.dto';

export class LeagueListDto {
  tier: string;
  leagueId: string;
  queue: string;
  name: string;
  entries: LeagueEntryDto[];
}
