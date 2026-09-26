# Baseline da refatoração arquitetural

- SHA: `217331a675974fe6531da5bfff63a06c5324fde9`
- Data da captura: 2026-09-26
- Ambiente: banco PostgreSQL e RabbitMQ descartáveis locais; nenhuma operação em produção
- Corpus: `docs/analysis/corpus-manifest.json` e fixtures versionadas

Este arquivo registra o ponto de comparação de ARQ-01. Resultados devem ser obtidos no mesmo SHA e não podem ser atualizados para acomodar regressões futuras.

O registro estruturado de ambiente, comandos, duração, saída e artefatos fica em `docs/architecture/validation-baseline.json`; logs preservados ficam em `docs/architecture/evidence/`.

## Inventário arquitetural

```bash
node scripts/architecture-inventory.cjs --check
```

Resultado: 424 arquivos cobertos (239 produção, 164 testes/fixtures, 21 scripts/configurações); zero SCC runtime entre arquivos, zero SCC adicional somente de tipos e zero ciclo de módulos Nest. Consulte `import-inventory.md`.

## Ambiente reproduzível

```bash
git rev-parse HEAD
node --version
npm --version
npx prisma --version
psql "$TEST_DATABASE_URL" -Atc 'show server_version'
```

Antes do build deste checkout foi necessário executar `npx prisma generate`, pois o Prisma Client local estava desatualizado. Isso é preparação do ambiente e não alteração de código/schema.

## Build, unidade e corpus

```bash
npm run build
npm test -- --runInBand
python3 scripts/test_metrics_corpus.py
```

Resultado observado: build passou; 98 suites/615 testes unitários passaram; corpus Python passou com 8 checks, 1 partida real + 9 casos sintéticos e 0 resultados inesperados.

## Contratos HTTP e integração

```bash
npm run test:e2e -- --runInBand
TEST_DATABASE_URL=postgresql://integration:integration@127.0.0.1:55439/high_br_integration \
TEST_RABBITMQ_URL=amqp://guest:guest@127.0.0.1:55679 \
npm run test:integration
```

Resultado observado fora do sandbox, que restringe bind/rede local: 27 suites/160 contratos HTTP passaram em 14,294 s; 16 suites/54 integrações passaram serialmente em 194,195 s. O registro estruturado contém os comandos e logs.

## Processamento, rebuild, dataset e benchmark

```bash
DATABASE_URL=postgresql://integration:integration@127.0.0.1:55439/high_br_integration \
node dist/processing-cli.js coverage

TEST_DATABASE_URL=postgresql://integration:integration@127.0.0.1:55439/high_br_integration \
node scripts/benchmark-release.cjs \
  --reset-disposable \
  --output /tmp/arq-baseline-benchmark.json
```

Também devem ser preservados os reconciliadores versionados de eventos, finais, inventário, contribuição, visão, objetivos, sequências e dataset. O executor registra aqui comandos/resultados finais, SHA dos artefatos e qualquer falha preexistente. Benchmarks locais medem regressão relativa no mesmo ambiente; não representam capacidade de produção.

O estudo offline do baseline produziu `insufficient_sample_or_coverage` com `N=1`, resultado esperado para o único jogo real do corpus e não uma falha da refatoração.

O benchmark capturado em `docs/architecture/evidence/benchmark.json` preservou hashes do bruto e do dataset, não produziu duplicatas, materializou 877 linhas por partida, mediu p95 de ingestão de 2306,506 ms e rebuild de três partidas em 5359,467 ms. Esta é uma nova captura do ambiente ARQ-01, sem comparação `--baseline` durante a execução.

## Invariantes para comparação

- rotas, status HTTP/OpenAPI e shapes existentes;
- fidelidade do corpus, null/zero, bigint, timestamps e identidade de eventos;
- filtros, paginação, coortes, rosters e regras de amostra insuficiente;
- processamento, redelivery, retry, lease, manutenção e rebuild retomável;
- atomicidade da publicação conforme ADR-001 e persistência separada de `MatchRaw`;
- exportação/estudo sem rede quando o contrato exige leitura offline;
- latência, payload e armazenamento do benchmark, distinguindo ruído de regressão.
