import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { IndicatorRepository } from './indicator.repository';
import { IndicatorService } from './indicator.service';
import { MATCH_PARTICIPANT_READER } from '../matches/contracts/participant-reader';
import { IndicatorController } from './indicator.controller';
@Module({
  imports: [PrismaModule],
  controllers: [IndicatorController],
  providers: [
    IndicatorRepository,
    { provide: MATCH_PARTICIPANT_READER, useExisting: IndicatorRepository },
    IndicatorService,
  ],
  exports: [IndicatorService],
})
export class IndicatorModule {}
