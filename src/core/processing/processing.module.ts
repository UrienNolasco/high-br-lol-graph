import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProcessingService } from './processing.service';

@Module({
  imports: [PrismaModule],
  providers: [ProcessingService],
  exports: [ProcessingService],
})
export class ProcessingModule {}
