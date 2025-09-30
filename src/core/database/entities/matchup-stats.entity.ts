import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('matchup_stats')
export class MatchupStats {
  @PrimaryColumn()
  patch: string;

  @PrimaryColumn()
  championId1: number; // O ID do campeão com menor valor numérico

  @PrimaryColumn()
  championId2: number; // O ID do campeão com maior valor numérico

  @PrimaryColumn()
  role: string; // Ex: 'TOP', 'JUNGLE', etc.

  @Column({ default: 0 })
  gamesPlayed: number;

  @Column({ default: 0 })
  champion1Wins: number;
}
