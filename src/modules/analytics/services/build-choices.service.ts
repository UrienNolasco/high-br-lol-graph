import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  BUILD_CHOICE_READER,
  type BuildChoiceReader,
} from '../../matches/ports/build-choice-reader';
import {
  CHOICE_CATALOG_READER,
  type ChoiceCatalogReader,
} from '../../matches/ports/choice-catalog-reader';
import {
  calculateBuildChoices,
  normalizeBuildChoiceFilters,
  BuildChoiceCatalogBundle,
} from '../pure/build-choices';
@Injectable()
export class BuildChoicesService {
  constructor(
    @Inject(BUILD_CHOICE_READER) private readonly reader: BuildChoiceReader,
    @Inject(CHOICE_CATALOG_READER)
    private readonly catalogs: ChoiceCatalogReader,
  ) {}
  async query(raw: Record<string, unknown>) {
    let filters;
    try {
      filters = normalizeBuildChoiceFilters(raw);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const cohort = await this.reader.findBuildChoiceCohort(filters);
    const versions = [...new Set(cohort.matches.map((m) => m.gameVersion))];
    const catalogs: Record<string, BuildChoiceCatalogBundle> = {};
    // Bound upstream concurrency and CDN timeouts; source client caches/deduplicates requests.
    for (let i = 0; i < versions.length; i += 4)
      await Promise.all(
        versions.slice(i, i + 4).map(async (version) => {
          const [items, choices] = await Promise.all([
            this.catalogs.getItemCatalog(version),
            this.catalogs.getChoiceCatalog(version),
          ]);
          catalogs[version] = { items, choices };
        }),
      );
    return calculateBuildChoices(cohort, filters, catalogs);
  }
}
