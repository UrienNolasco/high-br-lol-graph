import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './dataset.service';
@Module({
  imports: [PrismaModule],
  controllers: [DatasetController],
  providers: [DatasetService],
  exports: [DatasetService],
})
export class DatasetModule {}
