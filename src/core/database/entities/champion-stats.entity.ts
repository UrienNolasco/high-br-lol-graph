import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('champion_stats')
export class ChampionStats {
  @PrimaryColumn()
  patch: string;

  @PrimaryColumn()
  championId: number;

  @Column({ default: 0 })
  gamesPlayed: number;

  @Column({ default: 0 })
  wins: number;
}
