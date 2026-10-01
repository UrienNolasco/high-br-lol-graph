import { Module } from '@nestjs/common';
import { ReadSnapshotModule } from '../../core/prisma/read-snapshot.module';
import { SequenceExamplesAdapter } from './adapters/persistence/sequence-examples-reader';
import { SEQUENCE_EXAMPLES_READER } from './ports/sequence-examples-reader';
@Module({
  imports: [ReadSnapshotModule],
  providers: [
    SequenceExamplesAdapter,
    { provide: SEQUENCE_EXAMPLES_READER, useExisting: SequenceExamplesAdapter },
  ],
  exports: [SEQUENCE_EXAMPLES_READER],
})
export class SequenceExamplesModule {}
