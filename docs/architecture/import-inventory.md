# Inventário de dependências no baseline

Fonte: `217331a675974fe6531da5bfff63a06c5324fde9` (modo `arq01-snapshot`). Gerado por `node scripts/architecture-inventory.cjs`.

O JSON ao lado é a evidência canônica por arquivo e linha. Este resumo não substitui o JSON.

## Cobertura

| Item | Quantidade |
|---|---:|
| Arquivos analisados | 424 |
| Produção | 239 |
| Testes/fixtures | 164 |
| Scripts/ferramentas | 21 |
| Imports internos em produção/ferramentas | 685 |
| Imports externos em produção/ferramentas | 367 |

Extensões: `.cjs`, `.js`, `.jsx`, `.mjs`, `.py`, `.ts`, `.tsx`.

## Ciclos e reciprocidade

Ciclos reais entre arquivos no grafo runtime: **0**. Ciclos observáveis somente ao adicionar arestas de tipo: **0**. Ciclos entre módulos Nest: **0**.

Reciprocidade abaixo significa que existem imports nas duas direções entre áreas. Ela não implica, sozinha, SCC entre arquivos nem ciclo de DI.

| Áreas | A → B (runtime/tipo) | B → A (runtime/tipo) |
|---|---:|---:|
| `analytics` ↔ `matches` | 3/0 | 1/0 |
| `core/dataset` ↔ `worker` | 0/1 | 1/0 |
| `core/processing` ↔ `worker` | 0/1 | 5/0 |
| `core/stats` ↔ `worker` | 1/0 | 2/0 |

## Entrypoints

| Tipo | Arquivos |
|---|---|
| http | `src/main.ts`<br>`src/app.module.ts` |
| worker | `src/modules/worker/worker.controller.ts` |
| cli | `src/dataset-cli.ts`<br>`src/processing-cli.ts`<br>`src/vision-study-cli.ts` |
| scripts | `scripts/analyze-example-match.py`<br>`scripts/architecture-inventory.cjs`<br>`scripts/audit-match-report.ts`<br>`scripts/audit-metrics-corpus.py`<br>`scripts/audit-optional-indicators.ts`<br>`scripts/benchmark-release.cjs`<br>`scripts/build-champion-popularity-examples.cjs`<br>`scripts/build-economy-examples.cjs`<br>`scripts/build-map-presence-examples.cjs`<br>`scripts/build-review-examples.py`<br>`scripts/example-references.ts`<br>`scripts/measure-match-raw-local.py`<br>`scripts/test_metrics_corpus.py`<br>`scripts/validate-bounties-steals.cjs`<br>`scripts/validate-contribution.cjs`<br>`scripts/validate-final-stats.cjs`<br>`scripts/validate-kill-episodes.cjs`<br>`scripts/validate-objectives.cjs`<br>`scripts/validate-sequences.cjs`<br>`scripts/validate-vision.cjs` |
| scheduled | `src/core/queue/queue.service.ts`<br>`src/modules/collector/services/collector.service.ts` |

## Módulos Nest

| Módulo | Escopo | Arquivo | imports | providers | exports |
|---|---|---|---|---|---|
| TestAppModule | test | `src/app.controller.e2e-spec.ts` | — | — | — |
| AppModule | production | `src/app.module.ts` | IndicatorModule<br>LoggerModule<br>AppConfigModule<br>PrismaModule<br>ScheduleModule.forRoot()<br>DataDragonModule<br>ChampionsModule<br>StatsModule<br>PlayersModule<br>MatchesModule<br>AnalyticsModule<br>CollectorModule<br>WorkerModule<br>AdminModule<br>DatasetModule<br>ReferenceModule | — | — |
| AppConfigModule | production | `src/core/config/config.module.ts` | NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }) | — | — |
| DataDragonModule | production | `src/core/data-dragon/data-dragon.module.ts` | HttpModule | DataDragonService | DataDragonService |
| LockModule | production | `src/core/lock/lock.module.ts` | RedisModule | LockService | LockService |
| LoggerModule | production | `src/core/logger/logger.module.ts` | PinoLoggerModule.forRootAsync({
      useFactory: () => {
        const logLevel = process.env.LOG_LEVEL || 'info';
        const service = (process.env.APP_MODE || 'api').toLowerCase();
        const isProduction = process.env.NODE_ENV === 'production';

        return {
          pinoHttp: {
            level: logLevel,
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
                    ignore: 'pid,hostname',
                  },
                },
            formatters: {
              level: (label: string) => ({ level: label }),
              log: (object: Record<string, unknown>) => ({
                service,
                ...object,
              }),
            },
            redact: {
              paths: ['headers.authorization', 'req.headers.authorization'],
              censor: '[REDACTED]',
            },
            autoLogging: false,
          },
        };
      },
    }) | — | — |
| ContractTestModule | test | `src/core/metrics/metric-result.dto.spec.ts` | — | — | — |
| PrismaModule | production | `src/core/prisma/prisma.module.ts` | — | PrismaService | PrismaService |
| ProcessingModule | production | `src/core/processing/processing.module.ts` | PrismaModule | ProcessingService | ProcessingService |
| QueueModule | production | `src/core/queue/queue.module.ts` | ProcessingModule<br>PrismaModule | QueueConnection<br>QueueService<br>{
      provide: RABBITMQ_CHANNEL,
      useFactory: (connection: QueueConnection) => connection.channel,
      inject: [QueueConnection],
    } | QueueService<br>RABBITMQ_CHANNEL |
| RedisModule | production | `src/core/redis/redis.module.ts` | ConfigModule | RedisService | RedisService |
| ContractModule | test | `src/core/riot/dto/normalized-event.dto.spec.ts` | — | — | — |
| RiotModule | production | `src/core/riot/riot.module.ts` | ConfigModule<br>LockModule<br>RedisModule<br>HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      }),
    }) | RiotService<br>MatchParserService<br>TimelineParserService<br>RateLimiterService<br>RetryService<br>Logger | RiotService<br>MatchParserService<br>TimelineParserService<br>RateLimiterService<br>RetryService |
| StatsModule | production | `src/core/stats/stats.module.ts` | PrismaModule | PlayerStatsAggregationService | PlayerStatsAggregationService |
| TestAdminModule | test | `src/modules/admin/admin.controller.e2e-spec.ts` | — | { provide: RateLimiterService, useValue: {} }<br>{ provide: CollectorService, useValue: {} } | — |
| AdminModule | production | `src/modules/admin/admin.module.ts` | RiotModule<br>CollectorModule | — | — |
| AnalyticsModule | production | `src/modules/analytics/analytics.module.ts` | PrismaModule | AnalyticsRepository<br>AnalyticsService | — |
| ChampionsModule | production | `src/modules/champions/champions.module.ts` | DataDragonModule | ChampionListService<br>CurrentPatchService | — |
| TestCollectorModule | test | `src/modules/collector/collector.controller.e2e-spec.ts` | — | { provide: CollectorService, useValue: {} } | — |
| CollectorModule | production | `src/modules/collector/collector.module.ts` | ScheduleModule<br>RiotModule<br>QueueModule<br>PrismaModule<br>RedisModule | CollectorConfigService<br>CollectorPipelineService<br>CollectorService<br>CollectorRepository | CollectorService |
| DatasetModule | production | `src/modules/dataset/dataset.module.ts` | PrismaModule | DatasetService | DatasetService |
| IndicatorModule | production | `src/modules/indicators/indicator.module.ts` | PrismaModule | IndicatorRepository<br>IndicatorService | IndicatorService |
| MatchesModule | production | `src/modules/matches/matches.module.ts` | PrismaModule<br>DataDragonModule | MatchBountiesStealsService<br>ReportRepository<br>MatchReportService<br>ProgressionRepository<br>MatchProgressionService<br>MatchMapPresenceService<br>MatchSequencesService<br>KillEpisodesRepository<br>MatchKillEpisodesService<br>MatchVisionService<br>MatchObjectivesService<br>MatchRepository<br>CombatRepository<br>MatchCombatService<br>MatchDetailService<br>MatchGoldTimelineService<br>MatchTimelineEventsService<br>MatchBuildsService<br>MatchPerformanceService<br>MatchContributionService<br>MatchEconomyService | MatchBountiesStealsService<br>MatchSequencesService<br>MatchKillEpisodesService<br>MatchContributionService<br>MatchObjectivesService |
| TestPlayersModule | test | `src/modules/players/players.controller.e2e-spec.ts` | — | { provide: PlayerSearchService, useValue: {} }<br>{ provide: PlayerProfileService, useValue: {} }<br>{ provide: PlayerStatsService, useValue: {} }<br>{ provide: PlayerMatchesService, useValue: {} }<br>{ provide: SyncOrchestratorService, useValue: {} }<br>{ provide: SyncStatusService, useValue: {} } | — |
| PlayersModule | production | `src/modules/players/players.module.ts` | RiotModule<br>RedisModule<br>PrismaModule<br>QueueModule<br>ConfigModule<br>DataDragonModule | PlayerRepository<br>PlayerStatsRepository<br>MatchRepository<br>PlayerSearchService<br>PlayerProfileService<br>PlayerStatsService<br>PlayerMatchesService<br>SyncOrchestratorService<br>SyncStatusService<br>SyncService | — |
| ReferenceModule | production | `src/modules/references/reference.module.ts` | PrismaModule | ReferenceService | ReferenceService |
| TestStatsModule | test | `src/modules/stats/stats.controller.e2e-spec.ts` | — | { provide: ChampionStatsService, useValue: {} }<br>{ provide: ChampionDetailService, useValue: {} }<br>{ provide: ProcessedMatchesService, useValue: {} } | — |
| StatsModule | production | `src/modules/stats/stats.module.ts` | DataDragonModule<br>PrismaModule | ChampionStatsRepository<br>MatchCountRepository<br>ChampionStatsService<br>ChampionDetailService<br>ProcessedMatchesService<br>TierRankService | ChampionStatsService<br>ChampionDetailService<br>ProcessedMatchesService<br>TierRankService<br>ChampionStatsRepository |
| WorkerModule | production | `src/modules/worker/worker.module.ts` | RiotModule<br>PrismaModule<br>StatsModule<br>ProcessingModule | WorkerService<br>MatchPersistenceService | WorkerService |

## Acesso atual às tabelas

A classificação é sintática e inclui cada chamada Prisma reconhecida. A matriz normativa de propriedade está na ADR.

| Modelo (`@@map`) | Leitores de produção | Escritores de produção |
|---|---|---|
| ChampionStats (`champion_stats`) | — | `scripts/benchmark-release.cjs`<br>`src/core/processing/rebuild.service.ts`<br>`src/core/stats/player-stats-aggregation.service.ts` |
| DiscoveryObservation (`discovery_observations`) | `src/core/dataset/dataset-export.ts`<br>`src/core/processing/discovery-report.service.ts` | `scripts/benchmark-release.cjs`<br>`src/core/processing/processing.service.ts` |
| HistoricalMetricContribution (`historical_metric_contributions`) | `scripts/benchmark-release.cjs`<br>`src/core/dataset/dataset-export.ts`<br>`src/core/dataset/dataset-query.ts`<br>`src/modules/dataset/dataset.service.ts`<br>`src/modules/references/reference.service.ts` | `src/core/dataset/dataset-persistence.ts` |
| Match (`matches`) | `scripts/benchmark-release.cjs`<br>`src/core/dataset/dataset-query.ts`<br>`src/core/processing/discovery-report.service.ts`<br>`src/modules/collector/repositories/collector.repository.ts`<br>`src/modules/matches/repositories/combat.repository.ts`<br>`src/modules/matches/repositories/kill-episodes.repository.ts`<br>`src/modules/matches/repositories/match.repository.ts`<br>`src/modules/matches/repositories/progression.repository.ts`<br>`src/modules/matches/repositories/report.repository.ts`<br>`src/modules/matches/services/match-bounties-steals.service.ts`<br>`src/modules/matches/services/match-economy.service.ts`<br>`src/modules/matches/services/match-map-presence.service.ts`<br>`src/modules/matches/services/match-objectives.service.ts`<br>`src/modules/matches/services/match-sequences.service.ts`<br>`src/modules/matches/services/match-vision.service.ts`<br>`src/modules/players/repositories/match.repository.ts`<br>`src/modules/references/reference.service.ts`<br>`src/modules/stats/repositories/champion-stats.repository.ts`<br>`src/modules/stats/repositories/match-count.repository.ts`<br>`src/modules/stats/services/tier-rank.service.ts` | `scripts/benchmark-release.cjs`<br>`src/core/processing/rebuild.service.ts`<br>`src/modules/worker/services/match-persistence.service.ts` |
| MatchDiscovery (`match_discoveries`) | `src/core/dataset/dataset-persistence.ts` | — |
| MatchEventProjection (`match_event_projections`) | `scripts/benchmark-release.cjs`<br>`src/modules/analytics/repositories/analytics.repository.ts`<br>`src/modules/matches/repositories/combat.repository.ts`<br>`src/modules/matches/repositories/kill-episodes.repository.ts`<br>`src/modules/matches/repositories/progression.repository.ts`<br>`src/modules/matches/repositories/report.repository.ts` | `src/modules/worker/services/match-persistence.service.ts` |
| MatchParticipant (`match_participants`) | `scripts/benchmark-release.cjs`<br>`src/modules/analytics/repositories/analytics.repository.ts`<br>`src/modules/indicators/indicator.repository.ts`<br>`src/modules/matches/repositories/match.repository.ts`<br>`src/modules/players/repositories/match.repository.ts`<br>`src/modules/references/reference.service.ts`<br>`src/modules/stats/repositories/champion-stats.repository.ts` | `src/modules/worker/services/match-persistence.service.ts` |
| MatchProcessing (`match_processing`) | `scripts/benchmark-release.cjs`<br>`src/core/processing/discovery-report.service.ts`<br>`src/core/processing/processing.service.ts`<br>`src/core/processing/rebuild.service.ts`<br>`src/core/queue/queue.service.ts`<br>`src/modules/analytics/repositories/analytics.repository.ts`<br>`src/modules/indicators/indicator.repository.ts`<br>`src/modules/matches/repositories/combat.repository.ts`<br>`src/modules/matches/repositories/kill-episodes.repository.ts`<br>`src/modules/matches/repositories/match.repository.ts`<br>`src/modules/matches/repositories/progression.repository.ts`<br>`src/modules/matches/repositories/report.repository.ts`<br>`src/modules/matches/services/match-bounties-steals.service.ts`<br>`src/modules/matches/services/match-economy.service.ts`<br>`src/modules/matches/services/match-map-presence.service.ts`<br>`src/modules/matches/services/match-objectives.service.ts`<br>`src/modules/matches/services/match-sequences.service.ts`<br>`src/modules/matches/services/match-vision.service.ts`<br>`src/processing-cli.ts` | `scripts/benchmark-release.cjs`<br>`src/core/processing/processing.service.ts`<br>`src/core/processing/rebuild.service.ts`<br>`src/core/queue/queue.service.ts`<br>`src/modules/worker/services/match-persistence.service.ts` |
| MatchRaw (`match_raw`) | `scripts/benchmark-release.cjs`<br>`src/core/processing/processing.service.ts` | `scripts/benchmark-release.cjs`<br>`src/core/processing/processing.service.ts` |
| MatchTeam (`match_teams`) | `scripts/benchmark-release.cjs`<br>`src/modules/matches/repositories/match.repository.ts`<br>`src/modules/stats/repositories/champion-stats.repository.ts` | `src/modules/worker/services/match-persistence.service.ts` |
| MatchTimelineProjection (`match_timeline_projections`) | `scripts/benchmark-release.cjs`<br>`src/modules/analytics/repositories/analytics.repository.ts`<br>`src/modules/matches/repositories/progression.repository.ts` | `src/modules/worker/services/match-persistence.service.ts` |
| PlayerChampionStats (`player_champion_stats`) | `src/modules/players/repositories/player-stats.repository.ts` | `scripts/benchmark-release.cjs`<br>`src/core/processing/rebuild.service.ts`<br>`src/core/stats/player-stats-aggregation.service.ts` |
| PlayerStats (`player_stats`) | `src/modules/players/repositories/player-stats.repository.ts` | `scripts/benchmark-release.cjs`<br>`src/core/processing/rebuild.service.ts`<br>`src/core/stats/player-stats-aggregation.service.ts` |
| ProcessingMaintenance (`processing_maintenance`) | `src/core/processing/processing.service.ts`<br>`src/core/processing/rebuild.service.ts`<br>`src/core/queue/queue.service.ts`<br>`src/processing-cli.ts` | `scripts/benchmark-release.cjs`<br>`src/core/processing/rebuild.service.ts` |
| User (`users`) | `src/modules/analytics/repositories/analytics.repository.ts`<br>`src/modules/players/repositories/player.repository.ts` | `src/modules/players/repositories/player.repository.ts` |

## Reprodução

```bash
node scripts/architecture-inventory.cjs --check
node scripts/architecture-inventory.cjs --live --stdout > /tmp/architecture-inventory-live.json
node scripts/architecture-inventory.cjs --stdout > /tmp/architecture-inventory.json
```

`--check` regenera em memória e falha se qualquer um dos dois artefatos versionados estiver desatualizado.
