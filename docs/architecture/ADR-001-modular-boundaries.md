# ADR-001 — Fronteiras do monólito modular

- Estado: aceita para a migração ARQ-02–ARQ-13
- Data: 2026-09-26
- Baseline: `217331a675974fe6531da5bfff63a06c5324fde9`
- Decisão relacionada: `docs/REFATORACAO-ARQUITETURAL.md`
- Evidência mecânica: `docs/architecture/import-inventory.json`

## Contexto

O código reúne infraestrutura, regras de League of Legends, parsing, persistência e orquestração sob `core`. Isso permite que módulos consumam implementações internas e faz o worker ser proprietário acidental do modelo normalizado e da publicação transacional. O inventário do baseline encontrou dependências bidirecionais entre áreas sem encontrar um ciclo executável entre arquivos ou entre módulos Nest. Portanto, reciprocidade de áreas e ciclo de runtime são fatos diferentes e serão verificados separadamente.

Esta ADR fixa as fronteiras de destino. A migração não altera fórmulas, rotas, schema, versões, política de retry ou representação dos dados.

## Decisão

Adotamos módulos verticais com quatro tipos de código:

1. `domain`: valores e regras puras. Pode depender do próprio domínio, de `lib/math` e de contratos puros explicitamente permitidos de um módulo a montante, como o modelo normalizado publicado por `matches` para dataset e stats. Não importa adapters, Nest, Prisma, HTTP, DTO Riot/Data Dragon, filas ou relógio global.
2. `application`: casos de uso e portas de propriedade do módulo. Pode usar o próprio domínio, contratos públicos de módulos a montante e contratos técnicos estreitos. Não importa controllers nem repositórios concretos.
3. `adapters`: HTTP, banco, Riot/Data Dragon, fila, cron e CLI. Converte tipos externos em contratos da aplicação e do domínio. Prisma fica aqui.
4. `composition`: monta adapters e casos de uso nos entrypoints. Não contém regra de negócio.

`core` passa a conter somente mecanismos técnicos: configuração, conexão/Prisma, Redis, lock, logging, transporte de fila e clientes HTTP externos com seus DTOs. `core` não importa `modules`. A pequena biblioteca `lib/math` contém apenas operações sem conceitos de partida, jogador, campeão, roster, Riot, Nest ou Prisma.

Um contrato público é um arquivo nomeado em `contracts/` ou `ports/`, ou um caso de uso explicitamente exportado pelo módulo Nest. Não haverá `index.ts` geral que reexporte domínio, repositórios, DTOs e serviços. Consumidores importam o arquivo de contrato específico. Repositórios concretos, calculators internos, DTOs de transporte e providers auxiliares não são API pública.

Tipos externos são convertidos na borda: Riot/Data Dragon → adapter de `matches`/`champions` → modelo do domínio. Repositórios fazem domínio ↔ Prisma. O contexto de transação compartilhado será opaco para domínio e contratos; somente adapters de persistência podem convertê-lo em `Prisma.TransactionClient`.

## Responsabilidades e contratos públicos

| Área          | Propriedade                                                                  | Superfície pública seletiva de destino                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`        | Config, conexão, cache, locks, logs, transportes e clientes externos         | contratos técnicos específicos de cada adapter; nenhum barrel global                                                                                                                         |
| `lib/math`    | quantis, bandas, razões e operações matemáticas sem linguagem do jogo        | funções matemáticas por arquivo                                                                                                                                                              |
| `matches`     | modelo normalizado, frames/eventos, inventário/finais e cálculos por partida | `contracts/normalized-match.ts`, `contracts/normalized-timeline.ts`, `contracts/metric-result.ts`, `contracts/projection-compatibility.ts`, `ports/match-reader.ts`, `ports/match-writer.ts` |
| `processing`  | jobs, lease, bruto, retry de negócio, processamento e rebuild                | `contracts/process-match.ts`, `contracts/request-ingestion.ts`, `contracts/rebuild.ts`, `contracts/job-status.ts`, `ports/observation-reader.ts`                                             |
| `worker`      | payload AMQP, trace, ack/nack e chamada de `process-match`                   | nenhum contrato de domínio; somente adapter de entrada                                                                                                                                       |
| `collector`   | descoberta, origem, cobertura da amostra e cron                              | `contracts/discovery-reader.ts`, `contracts/coverage.ts`; envia `request-ingestion`                                                                                                          |
| `dataset`     | definições, materialização, lineage, consulta e exportação                   | `contracts/definition.ts`, `contracts/query.ts`, `ports/dataset-reader.ts`, `ports/dataset-writer.ts`                                                                                        |
| `stats`       | agregados, população e consultas estatísticas                                | `contracts/aggregate.ts`, `ports/stats-reader.ts`, `ports/stats-writer.ts`                                                                                                                   |
| `references`  | coortes de referência, seleção de roster e precisão                          | `contracts/reference-query.ts`                                                                                                                                                               |
| `analytics`   | comparações e evolução histórica                                             | `contracts/analytics-query.ts`                                                                                                                                                               |
| `indicators`  | catálogo, cursor, história e cálculo de indicadores                          | `contracts/indicator-query.ts`                                                                                                                                                               |
| `players`     | perfis, busca, sincronização e apresentação do jogador                       | `contracts/player-query.ts`; usa contratos de ingestão/leitura                                                                                                                               |
| `champions`   | apresentação e consulta de catálogo de campeões                              | `contracts/champion-catalog.ts`                                                                                                                                                              |
| `admin`       | endpoints operacionais autorizados                                           | chama contratos administrativos de `processing`, `collector` e rate limit                                                                                                                    |
| `studies`     | estudos offline versionados                                                  | consumidores de contratos públicos; nunca dependência da API/worker                                                                                                                          |
| `composition` | HTTP, worker e CLIs                                                          | somente roots de montagem                                                                                                                                                                    |

Os nomes são alvos para a migração; ARQ-03–ARQ-12 podem introduzi-los incrementalmente. Qualquer alias provisório deve constar no baseline do verificador, ter card proprietário e ser removido em ARQ-13.

## Matriz de dependências permitidas

`próprio` inclui as camadas internas do mesmo módulo respeitando a direção de imports `adapters → application → domain`. `core técnico` nunca inclui regras hoje alojadas em `core/metrics`, `core/dataset`, `core/stats`, `core/research` ou `core/processing`.

| Consumidor                 | Pode depender de                                                                               | Não pode depender de                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `lib/math`                 | biblioteca padrão                                                                              | qualquer módulo, Nest, Prisma, Riot/Data Dragon                               |
| domínio de qualquer módulo | próprio domínio, `lib/math` e contratos puros a montante permitidos na linha do módulo         | adapters, Nest, Prisma, HTTP, DTO externo, processing                         |
| `core` técnico             | outro mecanismo técnico estritamente necessário                                                | `modules`, estudos, regra de jogo                                             |
| `matches` application      | próprio, `lib/math`                                                                            | processing, worker, analytics e internos de outros módulos                    |
| adapters de `matches`      | próprio, `core/prisma`, DTOs externos `core/riot`/`core/data-dragon`                           | processing/worker; repositórios de outros módulos                             |
| `processing`               | próprios contratos/ports, `matches`/`dataset`/`stats` públicos, core técnico                   | worker, controllers, internos dos três módulos, implementação de collector    |
| `worker`                   | `processing/contracts/process-match`, transporte/logging core                                  | parser, modelo, persistência, Prisma, Riot, dataset ou stats                  |
| `collector`                | próprio, `processing/contracts/request-ingestion`, clientes Riot, Redis/cron/logging           | internals de processing, worker, dataset/stats                                |
| `dataset`                  | próprio, contratos/cálculos públicos de `matches`, `lib/math`, Prisma no adapter               | worker, core/processing, internos de matches                                  |
| `stats`                    | próprio, contratos/cálculos públicos de `matches`, `lib/math`, Prisma/Data Dragon no adapter   | worker, core/processing, internos de matches                                  |
| `references`               | próprio, contratos públicos de dataset/stats/matches, `lib/math`, Prisma no adapter            | core/dataset, core/statistics com jogo, core/processing, repositórios alheios |
| `analytics`                | próprio, contratos públicos de dataset/stats/matches, `lib/math`, Prisma no adapter            | repositories/calculators internos de matches; dependência inversa de matches  |
| `indicators`               | próprio, contratos públicos de dataset/stats/matches, `lib/math`, Prisma no adapter            | core/dataset, core/processing, internos alheios                               |
| `players`                  | próprio, leituras públicas de matches/stats, ingestão pública de processing, clientes externos | tabelas/repositórios de matches/stats, queue/job internos                     |
| `champions`                | próprio, cliente Data Dragon                                                                   | internos de stats/matches                                                     |
| `admin`                    | contratos operacionais públicos de processing/collector e rate limit                           | bancos ou serviços internos desses módulos                                    |
| `studies` e scripts        | contratos públicos de dataset/matches/stats/references/indicators e composição offline         | repositórios, services internos, MatchRaw direto                              |
| HTTP composition           | módulos Nest e adapters HTTP                                                                   | regras e queries ad hoc                                                       |
| CLI composition            | casos de uso públicos correspondentes                                                          | construção manual de grafos internos                                          |

`collector` persiste a observação sob sua propriedade e converte seu resultado para `processing/contracts/request-ingestion`; `processing` não importa `collector`. Quando processing precisa consultar lineage no momento da publicação, consome `processing/ports/observation-reader.ts`, porta definida pelo consumidor e implementada por um adapter de collector. A composition root injeta essa implementação. Assim, o código de processing não referencia arquivos de collector e não surge ciclo runtime; o contexto de origem continua explícito no comando e no lineage.

## Persistência e unidade transacional

Cada tabela tem um único proprietário lógico, descrito em `data-ownership.md`. Outros módulos leem por portas públicas. Escrita direta fora do proprietário só existe durante a migração e deve desaparecer no card indicado.

A publicação de uma partida continua sendo uma única transação coordenada por `processing`. Preparação pesada de parsing, cálculos e dataset ocorre antes da seção crítica. Dentro dela, a ordem obrigatória é:

1. adquirir o gate compartilhado de manutenção;
2. validar e bloquear a lease com `FOR UPDATE`;
3. gravar `Match`, `MatchTeam` e `MatchParticipant`;
4. gravar `MatchTimelineProjection` e `MatchEventProjection`;
5. substituir `HistoricalMetricContribution` com lineage;
6. atualizar `ChampionStats`, `PlayerStats` e `PlayerChampionStats` em ordem determinística;
7. marcar `MatchProcessing` como `COMPLETED`, limpar lease e registrar versão/data.

O bruto (`MatchRaw`) é capturado antes dessa publicação, em transação própria sob a lease, por desenho. A refatoração não o move para a transação de publicação. Nenhum writer abre transação interna quando recebe o contexto coordenado; nenhum evento assíncrono substitui as escritas. Gate, ordem de locks, renovação de lease, redelivery, retry e rollback mantêm a semântica existente.

ARQ-10 deve adicionar um ponto de fault injection por fronteira de escrita acima, incluindo a fronteira que marca `COMPLETED`. Para cada falha, o teste deve conferir todas as tabelas pertencentes a matches, dataset e stats, além do estado do job, e provar rollback integral. Deve ainda provar que falha na captura separada do bruto não publica projeções e que bruto já confirmado sobrevive a rollback posterior da publicação.

## Grafo do baseline

O comando `node scripts/architecture-inventory.cjs` resolve imports relativos e reexports, usa a emissão TypeScript para separar dependências runtime de imports apagados como tipo, e inventaria Nest e Prisma. O modo padrão fica fixado no snapshot ARQ-01 `217331a...`, de modo que o próprio commit da documentação não invalide sua evidência. `--live --stdout` analisa o checkout/HEAD corrente; ARQ-02 deve usar esse modo como base da verificação incremental, sem tratar o snapshot histórico como estado atual. No snapshot:

- não há SCC entre arquivos no grafo runtime;
- não há SCC adicional ao incluir arestas somente de tipo;
- não há ciclo entre `imports` de módulos Nest;
- há reciprocidade runtime entre `analytics` e `matches`, sem caminho de arquivos que forme SCC;
- `core/dataset` → `worker` e `core/processing` → `worker` são arestas somente de tipo no JavaScript emitido, mas continuam violações de propriedade;
- `core/stats` ↔ `worker` tem arestas runtime nas duas direções, também sem SCC de arquivos.

Logo, o verificador de ARQ-02 deve calcular SCC por arquivo e por módulo Nest, e relatar separadamente pares de áreas com arestas nas duas direções. `import type` não pode criar ciclo runtime, mas continua sujeito a regras de propriedade e acesso público.

## Violações atuais e card de remoção

| Violação do baseline                                                                       | Evidência típica                                                             | Remoção |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------- |
| modelo normalizado pertence ao parser do worker e carrega Prisma                           | `modules/worker/pure/match.parser.ts`                                        | ARQ-03  |
| contratos de métricas dependem da versão de processamento                                  | `core/metrics/metric-contract.ts`                                            | ARQ-04  |
| regras de coorte, remake, role e matemática estão misturadas                               | `core/metrics`, `core/statistics`                                            | ARQ-04  |
| Riot/Data Dragon misturam transporte, parsing e interpretação de domínio                   | `core/riot/*parser*`, snapshots, eventos, catálogos                          | ARQ-05  |
| matches ↔ analytics e consumidores importam internos de matches                           | `performance-calculator.ts`, `historical-solo.ts`, `analytics.repository.ts` | ARQ-06  |
| dataset está dividido entre `core/dataset` e `modules/dataset` e importa worker/internos   | imports listados no inventário                                               | ARQ-07  |
| agregação está em `core/stats`; leitura em `modules/stats`; players lê mapper interno      | `player-stats-aggregation.service.ts`, `aggregate.mapper.ts`                 | ARQ-08  |
| descoberta está em processing/Riot/collector e sua persistência não tem proprietário único | `core/processing/discovery*`, `riot.service.ts`, collector                   | ARQ-09  |
| job, rebuild e publicação estão em core/worker/queue; core importa módulo                  | `core/processing`, `match-persistence.service.ts`                            | ARQ-10  |
| worker e CLIs instanciam ou expõem casos de uso internos                                   | `processing-cli.ts`, `worker/*`                                              | ARQ-11  |
| references, indicators, analytics, research e scripts importam caminhos internos           | inventário por área e `migration-map.md`                                     | ARQ-12  |
| aliases, barrels e exceções temporárias restantes                                          | baseline incremental de ARQ-02                                               | ARQ-13  |

Nenhuma violação fica atribuída a “limpeza futura”: ARQ-13 remove apenas compatibilidade temporária criada e enumerada nos cards anteriores.

## Consequências e validação

ARQ-02 transforma esta matriz em regra executável, resolve aliases/reexports e mantém baseline decrescente. Testes podem importar fixtures de teste, mas produção não. Acesso a um arquivo `repositories/`, `adapters/`, `services/` ou `pure/` de outro módulo é proibido salvo contrato explicitamente listado nesta ADR.

As etapas seguintes devem comparar comportamento com `baseline.md`, atualizar o mapa de migração quando um destino real diferir e registrar qualquer mudança inevitável de hash como proveniência. ARQ-13 só conclui quando não houver exceções, aliases antigos, ciclos ou dependências proibidas.
