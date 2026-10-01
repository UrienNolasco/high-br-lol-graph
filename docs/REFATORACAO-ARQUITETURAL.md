# Plano de refatoração arquitetural

Data: 2026-09-23. Board: `high-br-lol` (#3). Base inspecionada: `217331a675974fe6531da5bfff63a06c5324fde9`.

Estado: refatoração integrada e validada localmente em 2026-10-01, no SHA `098858979b9f38e51eb7d69375c8de0bde352801`. ARQ-01 a ARQ-13 estão integrados; o aceite ARQ-14 está registrado em `docs/architecture/validation-arq14.json`, com integração PostgreSQL/RabbitMQ, reconciliações e benchmark aprovados. Após o fechamento do card #52, o backlog MET pode ser retomado respeitando suas dependências originais e os contratos públicos finais. Não houve push ou deploy em produção.

## Objetivo e limites

Migrar incrementalmente para um monólito modular com proprietário explícito de regras, contratos e dados. `core` oferece infraestrutura; módulos contêm domínio e casos de uso, além dos adapters. Reutilização não justifica mover negócio para `core`. Cada integração deve preservar o comportamento atual e reduzir dependências proibidas.

A refatoração não inclui novas análises MET, migração para microserviços, mudança de banco, novos mecanismos de eventos, deploy ou alteração em produção. Movimentação estrutural não justifica alteração automática de fórmulas, rotas, schema ou versões de dados. Qualquer incompatibilidade descoberta deve ser registrada e resolvida explicitamente, sem esconder mudança funcional.

## Diagnóstico original verificado

- `core/dataset` importa o parser do worker e cálculos internos de matches.
- `core/processing/rebuild.service.ts` importa WorkerService; a CLI instancia esse grafo manualmente e simula RiotService por cast.
- Agregação está em `core/stats`; consultas em `modules/stats`; o tipo compartilhado ProcessedMatchData pertence ao parser e contém tipos Prisma.
- `matches` usa perMinute de analytics; analytics usa cálculos e filtro de repositório de matches. Esta é dependência recíproca entre áreas, não prova por si só de ciclo runtime/DI.
- `core/riot` mistura cliente externo, parsing, modelos normalizados e dependências de métricas/processamento.
- Contratos de métricas, normalização e consultas importam constantes de execução de processing.
- `core/statistics` mistura matemática genérica com seleção de jogadores/regras do jogo; `core/research` contém estudo específico de visão.
- A persistência atual grava partida/projeções, dataset, agregados e COMPLETED na mesma transação. Esta garantia deve sobreviver à mudança.

## Responsabilidades de destino

| Área | Responsabilidade e contrato |
|---|---|
| core | Configuração, Prisma/conexão, Redis, filas, logging, clientes Riot/Data Dragon, DTOs externos e mecanismos técnicos; não importa módulos. |
| matches | Modelo normalizado, regras/cálculos por partida e contratos de persistência/leitura; regras puras independem de transporte, framework e ORM. |
| processing | Jobs, leases, retry de negócio, acesso ao bruto e casos de uso de processamento/rebuild; coordena operações públicas dos módulos em uma transação. |
| worker | Adapter de mensagens: payload, trace, ack/nack e chamada do caso de uso; não possui parser/modelo ou regra de processamento. |
| collector | Descoberta, origem/cobertura da amostra e solicitação de ingestão; cron é adapter, separado das consultas offline. |
| stats | Escrita e leitura de agregados, população e apresentação estatística; não depende do worker. |
| dataset | Registro de definições, construção, persistência, consultas e exportação; consome cálculos públicos de matches. |
| references, analytics, indicators | Políticas e casos de uso analíticos, consumindo contratos públicos de partidas/dataset/agregados. |
| players, champions, admin | Casos de uso e adapters próprios; consultas/ações sobre outras responsabilidades por contratos públicos. |
| biblioteca matemática | Somente operações independentes do jogo; sem IDs de partida, campeão, roster, ORM ou framework. |
| estudos | Consumidores de dados/contratos da aplicação; não são dependência da API ou do worker. |

Nomes finos de subpastas e pontos de entrada serão fixados pela ADR em ARQ-01. Não se exige uma interface por classe. As fronteiras devem separar regras puras, casos de uso e adapters quando existe dependência concreta a proteger. Contratos públicos não significam exportar todos os arquivos por um barrel.

## Direção das dependências e transação

Entrypoints compõem adapters e casos de uso. Worker/CLI de processamento chamam processing; processing coordena os contratos de matches, dataset e stats. Dataset e stats consomem o modelo/cálculos públicos de matches. Consumidores históricos usam os contratos desses módulos. O domínio não conhece o orquestrador; consultas de compatibilidade recebem metadados ou usam um contrato de leitura estável, sem importar o serviço de jobs.

Clientes externos conservam DTOs de transporte; adapters convertem esses DTOs no modelo do domínio. Regras retornam dados de domínio; repositórios convertem para Prisma. Interfaces de fonte online/offline e persistência ficam na responsabilidade que as consome. Implementações técnicas podem usar Prisma e um contexto transacional compartilhado sem levar tipos Prisma ao domínio.

A descoberta entrega contexto explícito de origem à ingestão ou disponibiliza um contrato de leitura independente do cron. A ADR deve impedir imports recíprocos entre collector e processing. Não criar um novo shared genérico com todas as regras para contornar esse requisito.

Preparação pesada de cálculos/dataset permanece fora da seção crítica. Na gravação, uma única transação continua cobrindo estado de partida/projeções, lineage e dataset, agregados e conclusão do job. Preservar ordem de locks, lease, manutenção, redelivery e rollback. A separação de módulos não cria transações independentes ou publicação assíncrona dessas escritas.

## Ordem e dependências

Tamanhos M/L expressam escopo relativo, não dias ou compromisso de prazo. Todas as tarefas são P0 em relação à retomada das funcionalidades. As dependências abaixo são também cadastradas nativamente no board.

| Card | Entrega | Depende de | Tamanho |
|---|---|---|---|
| ARQ-01 (#39) | Registrar fronteiras, dependências e baseline da arquitetura | — | M |
| ARQ-02 (#40) | Implantar verificação incremental das fronteiras arquiteturais | ARQ-01 | M |
| ARQ-03 (#41) | Dar ao módulo de partidas a propriedade do modelo normalizado | ARQ-02 | L |
| ARQ-04 (#42) | Redistribuir contratos de métricas, versões e matemática genérica | ARQ-03 | L |
| ARQ-05 (#43) | Separar clientes externos de parsing e regras de partida | ARQ-03, ARQ-04 | L |
| ARQ-06 (#44) | Encapsular partidas e eliminar dependências recíprocas com analytics | ARQ-04, ARQ-05 | L |
| ARQ-07 (#45) | Consolidar o dataset histórico no seu módulo | ARQ-06 | L |
| ARQ-08 (#46) | Unificar agregação e consulta de estatísticas em stats | ARQ-04, ARQ-05, ARQ-06 | L |
| ARQ-09 (#47) | Separar descoberta e política de coleta dos clientes externos | ARQ-05 | M |
| ARQ-10 (#48) | Extrair processamento e preservar a unidade transacional | ARQ-07, ARQ-08, ARQ-09 | L |
| ARQ-11 (#49) | Tornar worker e CLIs adapters dos casos de uso | ARQ-10 | M |
| ARQ-12 (#50) | Migrar referências, indicadores e estudos para contratos públicos | ARQ-07, ARQ-08, ARQ-09 | L |
| ARQ-13 (#51) | Remover compatibilidade temporária e tornar as fronteiras obrigatórias | ARQ-11, ARQ-12 | M |
| ARQ-14 (#52) | Validar a refatoração integrada e liberar o backlog MET | ARQ-01, ARQ-02, ARQ-03, ARQ-04, ARQ-05, ARQ-06, ARQ-07, ARQ-08, ARQ-09, ARQ-10, ARQ-11, ARQ-12, ARQ-13 | L |

Sequência principal: ARQ-01 → 02 → 03 → 04 → 05 → 06. Após as bases, dataset (07), stats (08) e descoberta (09) podem avançar quando seus predecessores terminarem. Processing (10) reúne essas fronteiras; worker/CLIs (11) e consumidores históricos (12) convergem na limpeza (13). A validação (14) depende diretamente de todos os outros cards. Eventual paralelismo deve respeitar propriedade de arquivos e serialização dos testes com banco.

## Bloqueio dos cards atuais

Os 34 cards MET que existiam no início desta solicitação recebem dependência nativa de ARQ-14 (#52). Este último depende dos outros 13 cards ARQ e só pode ser concluído após a integração e validação de todos. Não há dependências ARQ→MET: os commits existentes são insumo técnico, sem produzir um ciclo no board.

Os seis MET pendentes permanecem em Ready, bloqueados; os quatro que estavam Doing são pausados. Os 28 MET já concluídos permanecem em Done, com datas, descrições e evidências preservadas, e recebem a mesma dependência para impedir retomada/reabertura operacional antecipada. Bloqueio não apaga a entrega histórica. A CLI do board suporta dependências nativas e impede entrada em Doing com predecessor inacabado; o campo is_blocked sozinho também marca dependências concluídas, portanto a auditoria usa --actionable e o estado dos predecessores.

Depois do aceite de ARQ-14, as dependências permanecem como histórico e os MET voltam a ser elegíveis conforme seus vínculos originais. Nenhum MET é concluído, reiniciado ou integrado automaticamente por este planejamento.

Trabalho parcial preservado: MET-21 tem dois arquivos não commitados em .worktrees/met21/src/modules/evolution; MET-26 e MET-27 estavam limpos; MET-31 sem implementação. Na retomada, adaptar as branches aos contratos finais sem descartar alterações. Os demais MET pendentes são MET-28 e MET-32.

## Critério comum de conclusão

- Respeitar dependências e manter a dev compilável a cada integração.
- Uma branch isolada e um commit por card; sem Co-authored-by.
- Registrar SHA, arquivos/contratos alterados, verificações executadas e resultados no card.
- Não alterar fórmulas, rotas, schema, versões ou políticas de negócio por conveniência da movimentação; diferenças necessárias exigem justificativa explícita e revisão do plano.
- Preservar a transação e a ordem de locks; testes de banco com reset são serializados em ambiente descartável.
- Aliases temporários só com responsável/remoção em ARQ-13; nenhuma nova violação arquitetural.
- Não retomar cards MET antes da conclusão integral da refatoração.

Validação incremental usa os testes afetados; a validação completa ocorre no SHA integrado em ARQ-14. Os testes arquiteturais são necessários porque verificam a restrição que faltava, e os testes de transação cobrem os riscos reais da mudança. Comparar os resultados semânticos e registrar mudanças inevitáveis em hashes de proveniência decorrentes da movimentação dos arquivos.

Se uma etapa falhar, não avançar os dependentes: corrigir ou reverter o commit isolado antes de prosseguir. Comparar regressões contra o baseline reproduzido, sem atualizar limites/fixtures apenas para acomodar falhas. Nenhum card pode ser considerado pronto somente pelo rename dos arquivos.

## Cards detalhados

### ARQ-01 (#39) — Registrar fronteiras, dependências e baseline da arquitetura

Transformar o diagnóstico em uma decisão arquitetural verificável antes de mover código.

Prioridade: P0. Tamanho: M. Dependências: nenhuma.

**Escopo**

- Inventariar imports de produção, tipos, dependências Nest, entrypoints HTTP/worker/CLI e escritores/leitores das tabelas.
- Registrar matriz de propriedade por responsabilidade e matriz de dependências permitidas, incluindo collector, players, champions, admin, indicators e analytics.
- Definir contratos públicos e mapa origem/destino dos arquivos; distinguir regras de domínio, adapters externos e persistência.
- Reproduzir o baseline no HEAD registrado, com corpus, contratos HTTP/OpenAPI, processamento/rebuild, dataset e benchmark local existentes.

**Critérios de aceite**

1. ADR e grafo reproduzível distinguem dependência recíproca entre áreas de ciclo real de arquivos/DI.
2. Cada tabela/projeção tem responsável pela escrita e contratos de leitura; fronteira transacional está documentada.
3. Cada dependência proibida tem card de remoção; nenhuma obrigação fica em um genérico arrumar depois.
4. Resultados do baseline têm SHA, ambiente e comandos; falhas preexistentes estão identificadas antes da refatoração.

**Validação**

- Build, suites existentes relevantes e reconciliações/benchmark do baseline em ambiente descartável.
- Revisão da cobertura do inventário contra todos os módulos e scripts versionados.

**Risco principal:** Não confundir imports apenas de tipos com ciclos de execução, nem atribuir à refatoração uma falha preexistente.

### ARQ-02 (#40) — Implantar verificação incremental das fronteiras arquiteturais

Impedir que a migração aumente o acoplamento e tornar a arquitetura verificável no CI.

Prioridade: P0. Tamanho: M. Dependências: ARQ-01 (#39).

**Escopo**

- Adicionar comando reproduzível de análise de dependências, com caminhos relativos/aliases/reexports resolvidos.
- Aplicar regras de core, domínio, contratos públicos, código de teste e ciclos entre módulos; separar análise de tipos e runtime.
- Registrar somente violações atuais em baseline com responsável e card de remoção; proibir novas violações e baseline crescente.
- Integrar a verificação ao fluxo de validação/CI existente ou criar o job mínimo se não existir.

**Critérios de aceite**

1. Casos de violação intencional provam que core→modules, domínio→Prisma/HTTP/Nest e acesso a internos são detectados.
2. Import type e reexport não permitem contornar a regra de propriedade; não geram falsos ciclos de runtime.
3. Código de produção não importa fixtures/specs; testes têm exceções limitadas ao seu contexto.
4. Comando executa no CI e falha para novas violações; baseline provisório é explícito e removido em ARQ-13.

**Validação**

- Exercitar exemplos mínimos válidos/inválidos do verificador e executar sobre todo src e entrypoints.
- Build e validação do workflow alterado.

**Risco principal:** Um barrel não constitui encapsulamento se o verificador continua permitindo importar implementações internas.

### ARQ-03 (#41) — Dar ao módulo de partidas a propriedade do modelo normalizado

Desacoplar os contratos de partida do worker, dos DTOs Riot e do Prisma.

Prioridade: P0. Tamanho: L. Dependências: ARQ-02 (#40).

**Escopo**

- Extrair de modules/worker/pure/match.parser.ts o modelo de partida, participantes e times para o domínio público de matches.
- Definir contratos normalizados de frames/eventos, inventário e estatísticas finais no módulo responsável.
- Separar tipos de domínio de tipos JSON/linhas Prisma e DTOs de transporte; preservar bigint, ausência, unidades e timestamps.
- Atualizar consumidores ou usar compatibilidade temporária enumerada no baseline, com remoção obrigatória em ARQ-13.

**Critérios de aceite**

1. Domínio de partida compila e executa sem importar worker, Prisma, HTTP, DTOs Swagger ou clientes Riot.
2. Há uma definição canônica dos contratos; aliases temporários não duplicam modelos ou regras.
3. Persistência e contrato HTTP mantêm representação e semântica anteriores, inclusive null/zero e precisão numérica.
4. Consumidores usam entradas públicas de tipos, sem importar o arquivo do parser.

**Validação**

- Corpus de parser/projeções/inventário/finais e build.
- Contratos HTTP afetados e round-trip da persistência normalizada.

**Risco principal:** Remover Prisma.InputJsonValue de um tipo exige mapeamento explícito; casts não podem esconder perda de dados.

### ARQ-04 (#42) — Redistribuir contratos de métricas, versões e matemática genérica

Eliminar o vínculo entre regras analíticas e a implementação do processamento.

Prioridade: P0. Tamanho: L. Dependências: ARQ-03 (#41).

**Escopo**

- Classificar core/metrics e core/statistics por proprietário: regras de partida em matches; regras de coorte/referência em seus módulos.
- Manter somente matemática independente do jogo em biblioteca pequena, incluindo quantis/taxas quando aplicável.
- Separar versões dos contratos/projeções da versão de execução; passar metadados de processamento explicitamente aos cálculos.
- Mover DTOs OpenAPI para adapters HTTP e definir um contrato de compatibilidade de dados para consultas sem importar o serviço de processamento.

**Critérios de aceite**

1. Contratos e cálculos não importam core/processing nem modules/processing.
2. Regras de elegibilidade, remake, população, seleção de jogadores e investimento em visão têm responsável explícito.
3. Biblioteca matemática não conhece matchId, campeão, role, jogadores, Riot, Nest ou Prisma.
4. Valores de versões, políticas, resultados e interpretação dos registros existentes são preservados; mudanças semânticas não entram disfarçadas nesta tarefa.

**Validação**

- Testes existentes de métricas, elegibilidade, temporalidade, população, quantis e bandas.
- Contratos OpenAPI e exemplos materializados não sofrem mudança semântica.

**Risco principal:** Mover uma constante para outra pasta não resolve o acoplamento se ela ainda impõe política de execução ao domínio.

### ARQ-05 (#43) — Separar clientes externos de parsing e regras de partida

Fazer core/riot e core/data-dragon atuarem como integrações externas, sem importar funcionalidades.

Prioridade: P0. Tamanho: L. Dependências: ARQ-03 (#41), ARQ-04 (#42).

**Escopo**

- Manter transporte HTTP, rate limit, retry técnico, cache e DTOs externos nos adapters de integração.
- Mover parsing/normalização/projeções de core/riot para adapters de entrada do domínio de partidas, com regras puras no domínio.
- Retirar de RiotService dependências de discovery/failure-policy do processamento; separar falha de transporte de decisão de retry de negócio.
- Auditar catálogos Data Dragon: metadados/cache permanecem integração; interpretação de inventário, custo e habilidades pertence ao domínio.

**Critérios de aceite**

1. Clientes externos não importam modules nem regras de métricas/processamento.
2. Conversão DTO externo→modelo normalizado é explícita; domínio usa seu modelo e não DTO Riot.
3. Consultas existentes preservam leitura sem rede quando exigida e fallback explícito de catálogo ausente.
4. Parser conserva identidade de eventos, timestamps, unknowns, inventário e fidelidade do corpus.

**Validação**

- Testes de clientes, rate limiting, descoberta, cache e catálogos.
- Reconciliadores de eventos/frames/finais/inventário e contratos HTTP afetados.

**Risco principal:** Retry HTTP e retry de um job têm responsabilidades diferentes e não devem compartilhar uma política de negócio por conveniência.

### ARQ-06 (#44) — Encapsular partidas e eliminar dependências recíprocas com analytics

Publicar as capacidades de partidas e corrigir importações cruzadas de cálculos e repositórios.

Prioridade: P0. Tamanho: L. Dependências: ARQ-04 (#42), ARQ-05 (#43).

**Escopo**

- Definir entradas públicas enxutas para cálculos/modelos e para serviços de leitura/escrita de matches, sem inicializar o módulo HTTP para usar funções puras.
- Resolver matches/performance→analytics/perMinute e analytics→matches/combat/repository conforme propriedade das regras.
- Substituir consumo de COMBAT_EVENT_FILTER e outros detalhes de repositório por contratos de consulta suportados.
- Auditar consumidores de matches, incluindo relatório, comparações, dataset, referências e scripts.

**Critérios de aceite**

1. Não há dependência recíproca entre matches e analytics nem acesso de consumidores a repositórios/calculadores internos.
2. Cálculos por partida têm uma implementação canônica reutilizável, independente do adapter HTTP.
3. Queries preservam filtros, limites, paginação, consistência e evidências; relatório não passa a ler MatchRaw.
4. Matriz de imports permite apenas contratos publicados e documentados.

**Validação**

- Suites de cálculos e HTTP de matches/analytics.
- Verificador arquitetural e testes de consultas/relatório com limites e ausência de leitura bruta.

**Risco principal:** Exportar todos os arquivos em um index apenas esconderia o acesso a detalhes internos.

### ARQ-07 (#45) — Consolidar o dataset histórico no seu módulo

Reunir construção, materialização e consumo do dataset em modules/dataset.

Prioridade: P0. Tamanho: L. Dependências: ARQ-06 (#44).

**Escopo**

- Migrar core/dataset e unir com o módulo HTTP existente, separando definições/cálculos, casos de uso e adapters de persistência/exportação.
- Builder consome contratos públicos de matches e métricas; não importa worker nem cálculos internos.
- Publicar preparação pura e gravação na transação fornecida pelo coordenador, além de consultas/exportação versionadas.
- Preservar lineage, limites de consulta/exportação, separação de features/labels e prevenção de vazamento temporal.

**Critérios de aceite**

1. core/dataset deixa de ser necessário e todos os consumidores usam a API pública de dataset.
2. Identidade, versões, numeradores/denominadores e contribuições materializadas são equivalentes ao baseline.
3. Persistência não abre transação independente quando chamada pelo processamento; preparação pesada permanece fora da seção crítica.
4. Exportação conserva snapshot consistente, ordenação, limites e reprodutibilidade.

**Validação**

- Suites dataset de builder/query/export e contratos HTTP.
- Integração de persistência/rollback e comparação das contribuições/exportações com baseline.

**Risco principal:** A modularização não pode separar o commit do dataset do commit da partida ou ampliar o tempo de locks.

### ARQ-08 (#46) — Unificar agregação e consulta de estatísticas em stats

Remover a divisão de responsabilidade entre core/stats e modules/stats.

Prioridade: P0. Tamanho: L. Dependências: ARQ-04 (#42), ARQ-05 (#43), ARQ-06 (#44).

**Escopo**

- Migrar agregação e mapeamentos para stats e publicar operações de atualização transacional e consultas.
- Trocar dependência do parser/worker e TimelineDto por contratos normalizados de partida.
- Atualizar consumidores players, champions e analytics; resolver dependências recíprocas e exposição de repositórios.
- Explicitar propriedade de agregados, contagens de partidas elegíveis, rank/tier e política de ALL.

**Critérios de aceite**

1. Não existe segundo StatsModule em core e nenhum agregado importa worker ou parser de transporte.
2. Agregação usa a transação do processamento e mantém a ordem de aquisição dos locks.
3. Totais por patch/ALL, denominadores de pick/ban, filtros e respostas existentes são preservados.
4. Leituras entre módulos atravessam contratos definidos, sem novo acesso disperso às tabelas de agregados.

**Validação**

- Testes de população, stats, players e champions afetados.
- Integração de processamento concorrente/idempotência e reconciliação dos agregados.

**Risco principal:** Mover o serviço sem revisar direção de dependências pode criar um ciclo stats↔champions ou stats↔processing.

### ARQ-09 (#47) — Separar descoberta e política de coleta dos clientes externos

Dar à coleta a propriedade da descoberta e cobertura da amostra, mantendo integração Riot independente.

Prioridade: P0. Tamanho: M. Dependências: ARQ-05 (#43).

**Escopo**

- Mover regras/relatórios de discovery de core/processing para a responsabilidade de coleta definida na ADR.
- Definir contratos de observação, lineage e solicitações de ingestão entre collector, players/sync, admin e processing.
- Separar cron/adapters de casos de uso, para que status/coverage/lineage offline não inicializem agendamentos ou rede.
- Garantir que collector solicite ingestão e que processamento use dados de lineage por contrato, sem imports recíprocos de implementações.

**Critérios de aceite**

1. Observações imutáveis, múltiplas origens, idempotência e unknown histórico são preservados.
2. Clientes Riot não conhecem tipos de discovery/processamento e consultas de cobertura não dependem do worker.
3. Repositório/leitura de lineage tem proprietário e contrato; não há ciclo collector↔processing.
4. Endpoints administrativos e sincronização usam os novos contratos sem mudar política de coleta.

**Validação**

- Testes de discovery/coverage, collector, sync e admin afetados.
- Integração de múltiplas observações e comandos offline sem chamadas de rede.

**Risco principal:** O local do contrato de origem deve impedir que processamento importe cron ou que RiotService importe tipos do caso de uso.

### ARQ-10 (#48) — Extrair processamento e preservar a unidade transacional

Concentrar o ciclo de processamento em modules/processing sem depender do worker.

Prioridade: P0. Tamanho: L. Dependências: ARQ-07 (#45), ARQ-08 (#46), ARQ-09 (#47).

**Escopo**

- Migrar core/processing restante e extrair de WorkerService os casos de uso de processar partida e reprocessar/rebuild.
- Separar gestão de jobs/leases/falhas, acesso ao bruto, fonte online/offline e coordenação dos módulos participantes.
- Transferir responsabilidade de persistência de MatchPersistenceService para coordenação que usa operações públicas de matches, dataset e stats.
- Manter uma única transação para projeções/partida, lineage e dataset, agregados e COMPLETED; não introduzir eventos assíncronos nesse commit.

**Critérios de aceite**

1. Processing não importa worker/controller e rebuild aciona o caso de uso de processamento.
2. Falha em qualquer escrita reverte todo o conjunto; nenhuma conclusão parcial de job é possível.
3. Lease token, renovação, retries, trava de manutenção, retomada e ordenação de locks preservam as garantias atuais.
4. Redelivery não duplica contribuições/agregados; rebuild offline reproduz resultados sem rede.
5. Leitores obtêm estado/compatibilidade por contrato explícito; domínios e integrações não passam a depender do orquestrador.

**Validação**

- Integração PostgreSQL serial para rollback injetado em cada fronteira, concorrência, lease expirado e manutenção.
- Suites existentes de processamento/dataset e rebuild retomável com reconciliação.
- Build e grafo sem ciclos de arquivos, módulos ou DI.

**Risco principal:** É a etapa de maior risco: encurtar ou dividir a transação pode quebrar a consistência mesmo que os testes unitários passem.

### ARQ-11 (#49) — Tornar worker e CLIs adapters dos casos de uso

Remover a montagem manual e o acoplamento ao worker dos entrypoints.

Prioridade: P0. Tamanho: M. Dependências: ARQ-10 (#48).

**Escopo**

- Worker mantém recepção/validação de mensagem, trace e ack/nack, delegando o caso de uso.
- Reorganizar processing-cli, dataset-cli e factories de composição com dependências online/offline explícitas.
- Substituir offlineRiot como cast/falso cliente por fonte offline compatível com o contrato de entrada.
- Ajustar AppModule, providers/exports Nest, scripts npm e inicialização/encerramento de recursos.

**Critérios de aceite**

1. CLI offline inicializa somente recursos necessários, sem HTTP server, cron, Redis, RabbitMQ ou chamadas Riot.
2. Consumer preserva política de ack/nack/reentrega e propagação de trace.
3. Não existe construção duplicada e divergente do fluxo de processamento em CLI, worker e benchmark.
4. Comandos públicos e endpoints permanecem compatíveis; handles/conexões encerram corretamente.

**Validação**

- Smoke tests dos entrypoints compilados e testes de worker controller.
- Processamento/rebuild offline com clientes externos que falham se acionados.
- Inicialização Nest sem ciclos e encerramento sem processos pendentes.

**Risco principal:** Importar um módulo com cron para obter um serviço pode ativar efeitos colaterais no comando offline.

### ARQ-12 (#50) — Migrar referências, indicadores e estudos para contratos públicos

Concluir a separação dos consumidores históricos e do código de pesquisa.

Prioridade: P0. Tamanho: L. Dependências: ARQ-07 (#45), ARQ-08 (#46), ARQ-09 (#47).

**Escopo**

- Mover core/research para área de estudos com entrypoint próprio, sem dependência da aplicação de produção para pesquisa.
- Manter política de amostragem/rosters, precisão e interpretação de visão nos módulos de domínio responsáveis.
- Atualizar references, indicators, analytics e scripts de estudo/reconciliação para APIs públicas de dataset/matches/stats.
- Revisar contratos de consulta/compatibilidade para não importar versão ou serviços internos de processing.

**Critérios de aceite**

1. Nenhum consumidor importa core/dataset, core/statistics com regra de jogo, core/research ou arquivos internos de outro módulo.
2. Regras de N, amostra insuficiente, rosters disjuntos, censura, limites e ausência permanecem idênticas.
3. Estudo reproduz features/labels/resultados; hashes de código alterados por movimentação são identificados como proveniência, sem atualizar silenciosamente resultados.
4. Dependências de pesquisa não entram no grafo de inicialização da API/worker.

**Validação**

- Suites unitárias/HTTP/integração de referências e indicadores.
- Reprodução do estudo e exportação com comparação semântica e proveniência explícita.
- Análise de imports e build dos entrypoints de pesquisa.

**Risco principal:** Funções puras específicas de LoL não se tornam matemática genérica apenas por não acessarem banco.

### ARQ-13 (#51) — Remover compatibilidade temporária e tornar as fronteiras obrigatórias

Concluir a migração sem deixar aliases, exceções ou documentação sustentando a arquitetura anterior.

Prioridade: P0. Tamanho: M. Dependências: ARQ-11 (#49), ARQ-12 (#50).

**Escopo**

- Remover reexports/aliases provisórios, caminhos antigos e providers duplicados; conferir todo src, testes, scripts e configuração.
- Zerar baseline de violações transitórias e bloquear imports internos, dependências proibidas e ciclos no CI.
- Atualizar README, ADR, runbooks de processamento/dataset, documentação de métricas, exemplos e instruções de contribuição.
- Auditar APIs públicas para impedir exportação acidental de repositórios/DTOs de transporte e detalhes de persistência.

**Critérios de aceite**

1. core contém somente as responsabilidades técnicas definidas na ADR, sem imports de modules.
2. Não restam dependências proibidas, ciclos entre módulos ou exceções transitórias do baseline.
3. Domínio é independente de Nest, Prisma, transporte e adapters; biblioteca genérica não importa domínio.
4. Documentação e comandos apontam para arquivos reais; exemplos inválidos provam que o CI rejeita regressões.
5. Cada responsabilidade e tabela tem proprietário consistente com o código final.

**Validação**

- Build, verificação arquitetural completa e casos negativos do verificador.
- Checagem de referências a caminhos removidos e smoke dos comandos documentados.

**Risco principal:** Aceitar aliases permanentes ou exceções amplas preservaria o acoplamento sob novos nomes.

### ARQ-14 (#52) — Validar a refatoração integrada e liberar o backlog MET

Atestar equivalência funcional e novas fronteiras antes de permitir qualquer retomada dos cards atuais.

Prioridade: P0. Tamanho: L. Dependências: ARQ-01 (#39), ARQ-02 (#40), ARQ-03 (#41), ARQ-04 (#42), ARQ-05 (#43), ARQ-06 (#44), ARQ-07 (#45), ARQ-08 (#46), ARQ-09 (#47), ARQ-10 (#48), ARQ-11 (#49), ARQ-12 (#50), ARQ-13 (#51).

**Escopo**

- Revisar a integração de ARQ-01 a ARQ-13 na dev; a conclusão deste card depende de todos eles.
- Executar validação final no mesmo SHA: arquitetura/build, suites unitárias/HTTP/integração, corpus e reconciliações.
- Reexecutar ingestão, redelivery, falha/rollback, concorrência, rebuild retomável e exportação/estudo offline.
- Comparar benchmark de processamento, payload, latência e armazenamento com baseline, distinguindo ruído de regressão.
- Registrar resultado, commits por card e caminhos novos; orientar a adaptação das branches MET pausadas somente após esta conclusão.

**Critérios de aceite**

1. Todos os outros 13 cards ARQ estão concluídos e integrados, com evidências e um commit por card.
2. Grafo final atende às regras sem baseline de exceções; APIs, dados e resultados preservam o comportamento documentado.
3. Projeções/dataset/agregados e COMPLETED continuam atômicos; testes negativos e concorrência passam.
4. Diferenças de desempenho/dados têm investigação e resolução, sem rebaixar limites para ocultar regressões.
5. Relatório final vincula SHA, ambiente, comandos, resultados e limitações; nenhuma operação em produção foi executada.
6. Somente depois do aceite este card vai para Done: a dependência nativa libera os MET sem remover seus vínculos originais.

**Validação**

- Suites completas adequadas ao código integrado; PostgreSQL/RabbitMQ descartáveis com testes que alteram estado executados serialmente.
- Benchmark/reconciliação existentes adaptados apenas aos contratos públicos, sem reduzir cobertura.
- Auditoria do board: 13 predecessores concluídos, 34 cards originais preservados e trabalhos parciais disponíveis.

**Risco principal:** Este card não pode ser concluído apenas porque os arquivos foram movidos ou porque a implementação passou em testes unitários.

