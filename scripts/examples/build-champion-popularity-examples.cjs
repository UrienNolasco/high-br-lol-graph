// Run after npm run build. Controlled examples, not population observations.
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  championDto,
  toChampionMetrics,
} = require('../../dist/composition/study-api');
const {
  TierRankService,
} = require('../../dist/composition/study-api');

const tier = new TierRankService();
const row = {
  championId: 9999,
  championName: null,
  patch: '16.2',
  queueId: 420,
  gamesPlayed: 0,
  performanceN: 0,
  wins: null,
  losses: null,
  winRate: null,
  kda: null,
  dpm: null,
  cspm: null,
  gpm: null,
  pickRate: 0,
  banRate: 200 / 3,
  pickedMatches: 0,
  bannedMatches: 2,
  eligibleN: 3,
  selectedN: 5,
  bansObservedN: 3,
  excludedN: 2,
  excludedReasons: { unknown_remake: 1, missing_eligibility_projection: 1 },
};
const render = (input) =>
  championDto(
    input,
    tier.calculateChampionScore(
      input.championId,
      input.patch,
      toChampionMetrics(input),
      null,
    ),
    null,
    null,
    false,
    null,
  );
const examples = {
  provenance:
    'Controlled synthetic examples produced by application DTO/heuristic functions. No production observations; only patch16.2 eligibility has real corpus evidence.',
  banOnlyUnknownCatalog: render(row),
  missingBans: render({ ...row, eligibleN: 4, selectedN: 6, banRate: null }),
  observedZeroBans: render({
    ...row,
    championId: 1,
    championName: 'Annie',
    gamesPlayed: 2,
    pickedMatches: 2,
    performanceN: 2,
    wins: 1,
    losses: 1,
    winRate: 50,
    kda: 2,
    dpm: 600,
    cspm: 7,
    gpm: 400,
    pickRate: 200 / 3,
    bannedMatches: 0,
    banRate: 0,
  }),
  emptyPopulation: {
    data: [],
    total: 0,
    page: 1,
    limit: 20,
    cohort: {
      patch: '16.2',
      queueId: 420,
      mapId: 11,
      eligibleN: 0,
      selectedN: 1,
      excludedN: 1,
      bansObservedN: 0,
      excludedReasons: { missing_eligibility_projection: 1 },
    },
  },
};
writeFileSync(
  join(__dirname, '../../docs/analysis/met23-api-examples.json'),
  JSON.stringify(examples, null, 2) + '\n',
);
