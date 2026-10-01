import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { DataDragonModule } from '../../core/data-dragon/data-dragon.module';
import { BUILD_CHOICE_READER } from './ports/build-choice-reader';
import { CHOICE_CATALOG_READER } from './ports/choice-catalog-reader';
import { BuildChoiceRepository } from './repositories/build-choice.repository';
import { ChoiceCatalogAdapter } from './adapters/data-dragon/choice-catalog.adapter';
@Module({
  imports: [PrismaModule, DataDragonModule],
  providers: [
    { provide: BUILD_CHOICE_READER, useClass: BuildChoiceRepository },
    { provide: CHOICE_CATALOG_READER, useClass: ChoiceCatalogAdapter },
  ],
  exports: [BUILD_CHOICE_READER, CHOICE_CATALOG_READER],
})
export class BuildChoiceQueriesModule {}
