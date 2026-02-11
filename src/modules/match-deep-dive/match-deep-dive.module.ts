import { Module } from '@nestjs/common';
import { MatchDeepDiveController } from './match-deep-dive.controller';
import { MatchDeepDiveService } from './match-deep-dive.service';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MatchDeepDiveController],
  providers: [MatchDeepDiveService],
})
export class MatchDeepDiveModule {}
