import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { IndicatorRepository } from './indicator.repository';
import { IndicatorService } from './indicator.service';
import { IndicatorController } from './indicator.controller';
@Module({
  imports: [PrismaModule],
  controllers: [IndicatorController],
  providers: [IndicatorRepository, IndicatorService],
  exports: [IndicatorService],
})
export class IndicatorModule {}
