import { Module } from '@nestjs/common';
import { ReadSnapshotModule } from '../../core/prisma/read-snapshot.module';
import { DatasetWindowQueryModule } from '../dataset/window-query.module';
import { SequenceExamplesModule } from '../matches/sequence-examples.module';
import { EvolutionController } from './evolution.controller';
import { EvolutionRepository } from './adapters/evolution.repository';
@Module({
  imports: [
    ReadSnapshotModule,
    DatasetWindowQueryModule,
    SequenceExamplesModule,
  ],
  controllers: [EvolutionController],
  providers: [EvolutionRepository],
})
export class EvolutionModule {}
