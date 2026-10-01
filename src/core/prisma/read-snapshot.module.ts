import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';
import { ReadSnapshot } from './read-snapshot';
@Module({
  imports: [PrismaModule],
  providers: [ReadSnapshot],
  exports: [ReadSnapshot],
})
export class ReadSnapshotModule {}
