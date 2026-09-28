import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ReferenceController } from './reference.controller';
import { ReferenceRepository } from './adapters/reference.repository';
import { ReferenceService } from './reference.service';
@Module({
  imports: [PrismaModule],
  controllers: [ReferenceController],
  providers: [ReferenceRepository, ReferenceService],
  exports: [ReferenceService],
})
export class ReferenceModule {}
