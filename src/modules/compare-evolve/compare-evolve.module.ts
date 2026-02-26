import { Module } from '@nestjs/common';
import { CompareEvolveController } from './compare-evolve.controller';
import { CompareEvolveService } from './compare-evolve.service';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompareEvolveController],
  providers: [CompareEvolveService],
})
export class CompareEvolveModule {}
