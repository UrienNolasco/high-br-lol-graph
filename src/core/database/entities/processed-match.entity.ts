import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('processed_matches')
export class ProcessedMatch {
  @PrimaryColumn()
  matchId: string;

  @Column()
  patch: string;

  @CreateDateColumn()
  processedAt: Date;
}
