import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { DATASET_DEFINITIONS } from './modules/dataset/contracts/definition';
import { normalizeDatasetFilters } from './modules/dataset/contracts/query';
import {
  exportHistoricalDataset,
  stableJson,
} from './modules/dataset/adapters/dataset-export.adapter';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'definitions') {
    console.log(stableJson(DATASET_DEFINITIONS));
    return;
  }
  if (command !== 'export')
    throw new Error(
      'Usage: dataset definitions | export --filters file.json --out NEW_DIRECTORY --train-before ISO --validation-before ISO [--max-rows 100000]',
    );
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      ![
        '--filters',
        '--out',
        '--train-before',
        '--validation-before',
        '--max-rows',
      ].includes(args[i]) ||
      !args[i + 1] ||
      flags[args[i]]
    )
      throw new Error('Invalid export flags');
    flags[args[i]] = args[i + 1];
  }
  if (!flags['--out']) throw new Error('--out is required');
  const filters = normalizeDatasetFilters(
    flags['--filters']
      ? (JSON.parse(await readFile(flags['--filters'], 'utf8')) as Record<
          string,
          unknown
        >)
      : {},
  );
  const prisma = new PrismaClient();
  try {
    const result = await exportHistoricalDataset(prisma, {
      filters,
      out: flags['--out'],
      split: {
        trainBeforeMs: Date.parse(flags['--train-before']),
        validationBeforeMs: Date.parse(flags['--validation-before']),
      },
      maxRows: flags['--max-rows'] ? Number(flags['--max-rows']) : undefined,
    });
    console.log(
      stableJson({
        out: result.out,
        counts: result.summary.counts,
        manifestSha256: result.manifestSha256,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
