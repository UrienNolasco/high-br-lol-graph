# Dataset histórico MET19

O dataset materializa contribuições compactas de participante, time e partida para consultas históricas e pesquisa. A versão inicial é `datasetVersion=1`, com definições individualmente versionadas, publicada na geração de processamento **4**. A allowlist executável está em `src/modules/dataset/contracts/definition.ts`; `GET /api/v1/dataset/definitions` publica fontes, unidade, sujeito e regra temporal. É uma fundação para H01–H06, sem inferir causalidade, percentis populacionais ou rank histórico.

## Identidade, fórmulas e ausência

Uma contribuição tem chave única `(matchId, subjectKind, subjectId, definitionId, definitionVersion, horizonKey)` e um ID SHA-256 determinístico dessa tupla. `horizonKey` é `t:300000`, `t:600000`, `t:900000`, `t:1200000` ou `final`. Não se contam dez participantes ou vários horizontes como várias partidas.

Cada linha armazena `sampleCount=1`, `validCount=1` somente quando `value` é finito, e `sumValue=value` nesse caso. Ausência usa `value=null`, `validCount=0`, `sumValue=0` e um motivo; o zero auxiliar da soma nunca significa observação zero. Agregação de uma definição/sujeito/horizonte usa `mean=sum(sumValue)/sum(validCount)`, nula sem observações válidas. `rows`, `matches` e `players` contam respectivamente linhas, partidas distintas e PUUIDs distintos presentes em `playerIds`; times e partidas carregam seus membros observados, não um jogador artificial.

Métricas que possuem denominador conservam `numerator`, `denominatorValue`, `ratioScale` e a descrição do denominador. A consulta oferece tanto média de valores quanto `ratioOfSums=ratioScale*sum(numerator)/sum(denominatorValue)`, usando apenas pares válidos de denominador positivo e expondo `ratioRows`. Percentuais usam escala 100; métricas por minuto com denominador em segundos usam escala 60. São estimandos diferentes. C07 preserva mortes associadas/oportunidades elegíveis de MET15, sem trocar o denominador por partidas. Totais simples, inclusive wards, não ganham denominadores inventados: sua contagem é o valor, e `validCount` identifica jogos/sujeitos observados.

## Predição até t e descritivos finais

| Família | Horizonte e regra | Sujeitos |
| --- | --- | --- |
| `snapshot.totalGold/currentGold/xp/level/minionsKilled/jungleMinionsKilled/totalCs` | Último snapshot em `[t-60000,t]`, empate determinístico MET01, sem interpolação. CS total soma lane+jungle do mesmo frame. | Participante; ouro, XP e CS total também somam exatamente 5 participantes do time no mesmo frame. |
| `events.kills/deaths/assists/soloKills/wardsPlaced/wardsKilled/epicObjectiveLastHits` | Eventos normalizados distintos, timestamp conhecido em `[0,t]`, atribuição conhecida. Requer snapshot de cobertura próximo a t. Zero observado é permitido; ausência/atribuição inválida é nula. | Participante; kills/wards também time e partida. |
| `final.*` | MET10/11/13/14/15, com seus gates e denominadores finais. Contribuição, combate, visão, objetivos, C07/O05/O08. | Conforme a definição. |
| `label.win` | Resultado final observado, binário. | Participante e time. |

A extração preditiva é uma função pura independente dos reconciliadores finais. Nem ouro final, placar final, vitória, `finalStats`, duração futura ou eventos posteriores determinam seus valores. `sourceMaxTimestampMs` é a maior data das fontes efetivamente usadas, sempre `<=horizonMs` para valores disponíveis; fonte temporal ausente torna a métrica indisponível. O banco reforça esse contrato com CHECK. Snapshot/projeção não suportado também produz ausência explícita.

Os campos preditivos `events.wardsPlaced` e `events.wardsKilled` contam **eventos literais** do tipo correspondente, incluindo `wardType` desconhecido; não são contagens de wards reconhecidas nem medidas de cobertura espacial. Não substituir com eles os totais finais reconhecidos de MET11. Uma análise que exige tipos de ward deve separar conhecidos/desconhecidos nas projeções timestampadas e declarar essa derivação e sua cobertura no protocolo.

Uma morte ambiental com `killerId=0` explicitamente normalizado não é um abate de jogador. Uma assistência ausente/inválida não vira lista vazia para inferir solo. Identidades de evento repetidas idênticas contam uma vez; conteúdo conflitante sob a mesma identidade invalida a família afetada. Eventos de outra partida não são aceitos. Posições não são usadas para inventar wards. A cobertura significa observações disponíveis no corpus, não prova que Riot registrou todas as ações.

`eligible` e `horizonComplete` são **metadados retrospectivos de seleção**, separados dos valores das features: aplicam população/remake de MET23 e alcance do horizonte. A consulta exclui inelegíveis por padrão; `eligibleOnly=false` permite auditá-los. Isso pode selecionar uma população condicionada ao jogo ter durado até t, e deve ser declarado no estudo. Role vem do resumo final: útil para coortes, não uma feature comprovadamente conhecida naquele instante. Ouro relativo/oponentes podem ser calculados por consumidores sob regras explícitas a partir dos valores compactos e contexto, sem incorporar finais na feature.

## Consulta comum

```http
GET /api/v1/dataset?patch=16.2&queueId=420&mapId=11&subjectKind=participant&definitionId=snapshot.totalGold&horizonKey=t:900000&limit=100
GET /api/v1/dataset?playerId=PUUID&championId=103&role=MID&fromMs=1767225600000&toMs=1769904000000&eligibleOnly=false
```

Patch é exato `major.minor` (`16.2` não inclui `16.20`); período é `[fromMs,toMs)` em `gameCreation`. Os filtros adicionais são `usage`, `definitionId` e `horizonKey`. Aliases de role usam MET01. `championId/role` são coortes de participantes; aplicá-los naturalmente exclui linhas de time/partida, que têm esses campos nulos. `playerId` procura membros, portanto alcança o participante e seus times/partidas.

A resposta inclui página de até 500 linhas, cursor `nextAfter` por ID estável, filtros normalizados e resumo da **consulta inteira**, não apenas da página. Resumo inclui contagens distintas, grupos de mesma definição/versão/sujeito/horizonte, exclusões retrospectivas (antes do filtro de elegibilidade), motivos de valores ausentes (depois dos filtros) e `unmaterializedMatches`: partidas da coorte sem qualquer contribuição da geração atual. Esse último contador é evidência explícita de ausência, não promessa de cobertura de todos os jogadores/partidas da região. GET consulta somente tabelas persistidas e usa RepeatableRead para página+resumo. Páginas independentes podem refletir ingestões ocorridas entre requisições; exportação oferece uma fotografia única.

`DatasetRowDto` e `DatasetResponseDto` são o contrato OpenAPI. `datasetWhere`, `datasetSqlWhere`, `normalizeDatasetFilters`, `queryDatasetSummary`, `DatasetService` e registro são reutilizáveis por MET20/21/22/26–32. Valores SQL são ligados como parâmetros; nomes de filtros desconhecidos são rejeitados.

## Exportação reproduzível

```sh
npm run build
node dist/dataset-cli.js definitions
node dist/dataset-cli.js export --filters docs/analysis/met19-export-filter.json --out /tmp/met19-study-NEW --train-before 2026-01-01T00:00:00Z --validation-before 2026-02-01T00:00:00Z
```

O comando usa `DATABASE_URL` explicitamente configurada pelo operador. Não inicia API, Redis, RabbitMQ, Riot ou rebuild. O diretório de destino deve ser novo. O limite declarado é 100000 linhas por exportação (reduzível por `--max-rows`); ultrapassá-lo gera erro sem exportação parcial, e o operador deve particionar pelos mesmos filtros de período. É um limite operacional inicial, não uma amostra estatística aleatória. Arquivos são preparados em diretório temporário e publicados juntos.

- `features.jsonl`: somente allowlist de identificadores, definição/horizonte, valor/ausência, num/denom e partição. Nunca contém métricas finais, rótulos, role, rank, flags de elegibilidade ou objetos completos de qualidade/episódios.
- `labels.jsonl`: resultado final separado.
- `descriptive.jsonl`: métricas retrospectivas finais separadas.
- `metadata.jsonl`: coorte, qualidade compacta, IDs de evidência e linhagem, elegibilidade e `processedAt` real (instante lógico único da publicação, capturado após validar o lease; o COMMIT físico ocorre depois). **Não é uma allowlist de features.**
- `observations.jsonl`: observações de descoberta referenciadas pelas linhas, preservando conta consultada, fonte e tempo/rank observado.
- `manifest.json`: filtros, registro completo e hash, versões, contagens/exclusões/ausências, cortes temporais, N de partidas em cada split, políticas, bytes/linhas/hash SHA-256 por arquivo.

Split usa `gameCreation`: treino `<trainBeforeMs`, validação `[trainBeforeMs,validationBeforeMs)`, teste `>=validationBeforeMs`. Todas as definições, horizontes e sujeitos da mesma partida permanecem juntos. A função `splitForMatch` é pública; nada usa divisão aleatória de linhas. Reutilização de jogadores entre splits é possível e está refletida nas contagens; isolamento por jogador é um protocolo diferente, não alegado aqui.

A exportação lê uma transação RepeatableRead; ordenação/canonicalização são determinísticas. Mesmas linhas persistidas, filtros e cortes produzem os mesmos bytes/hashes. Não se inclui o relógio da execução no manifest. Um rebuild muda a proveniência real `processedAt`, portanto muda os hashes de metadados/manifest mesmo se valores e IDs forem iguais — essa diferença é intencional e auditável.

Linhagem é capturada no momento da publicação do worker. Múltiplas descobertas não duplicam contribuições; IDs e fontes são compactos por linha e observações completas ficam no arquivo separado. Descoberta posterior exige republicação/rebuild para entrar nesse retrato. Linhagem inexistente é `status=unknown`, nunca “coleta completa”. Rank do coletor/conta é observado na descoberta, **não rank na época da partida nem rank dos dez participantes**.

## Persistência e reconstrução

A migration aditiva `20260923200000_met19_historical_dataset` cria tabela, índices curtos, chave única, FK com cascade e CHECKs de finitude/ausência/tempo/versão. Definições e versões antigas não são silenciosamente misturadas com atuais. O worker prepara os cálculos puros e a conversão JSON antes de abrir a transação. Dentro dela revalida lease/manutenção e captura linhagem/proveniência; grava partida, projeções e substituição integral das contribuições antes de obter os locks dos agregados compartilhados. Agregados e conclusão do job ficam por último, mantendo o timeout de 30s e a publicação atômica; reutiliza a mesma geração e o mesmo instante de publicação para eventos, dataset e `MatchProcessing.completedAt`. Falha posterior à inserção de linhas reverte tudo. A substituição remove inclusive definições retiradas do registro.

As transações curtas de admissão `enqueue/claim` usam limite explícito de 30s e espera de conexão de 5s, abaixo do lease de 120s. O limite implícito anterior de 5s expirou durante CPU de outros workers (erro observado aos 6553ms); isso não muda asserções nem prazos dos testes. O cenário de seis partidas aguarda todas as promessas, inclusive falhas, antes de verificar publicação, evitando trabalho residual entre testes. A função compartilhada `calculateVisionTotals` calcula apenas os dois contadores usados pelo dataset e reutiliza os mesmos gates/contextos/evidências do relatório MET11. Não reconstrói janelas detalhadas dez vezes por partida. Testes comparam integralmente os resultados, incluindo nulos/zero/versões.

Após migration, dados anteriores ficam explicitamente não materializados até **rebuild offline geração 4**. Usar o fluxo já existente em `docs/RECONSTRUCAO-PROJECOES.md`: parar os processos indicados, verificar raws/cobertura e executar `node dist/processing-cli.js rebuild` (ou `rebuild --resume` somente para retomada). Rebuild é uma operação do operador; nenhum GET o dispara. Raw ausente impede reconstrução honesta e permanece evidência de ausência. Mudança de semântica exige incrementar definitionVersion; mudança de conjunto persistido exige nova geração/rebuild.

## Evidência e limites

A fixture real é uma única partida BR1 no patch16.2, fila 420, mapa 11, com 10 participantes. Testes sintéticos identificados alteram horário/IDs/qualidade/outcome/prefixos para verificar contratos; não ampliam cobertura empírica de patch ou população. Exemplos em `docs/analysis/met19-dataset-example.json` usam observações dessa fixture e proveniência sintética declarada. O benchmark local registra linhas/bytes por partida para MET33; não é previsão de carga em produção.

Validação inclui: quatro horizontes imunes a remoção/envenenamento do futuro; assistência/sentinelas/versões/identidades; unidades e numeradores; filtros/split/allowlist; HTTP sob ValidationPipe real; PostgreSQL com worker, dois rebuilds, replay, retirada de definição, rollback após materialização, CHECKs, paginação, contagens distintas, exclusões versus ausência, FK cascade e exportações byte-idênticas. Os relatórios finais de execução e benchmark ficam junto aos exemplos. Nenhuma operação desta entrega toca produção.

Validação final em 23/09/2026: build e 29/29 testes PostgreSQL em duas suítes passaram (159,651s), incluindo seis publicações concorrentes, recuperação e dois rebuilds. Migration aplicada, segundo deploy sem pendências e `prisma migrate diff` sem diferenças. HTTP `/api/v1/dataset`: 7/7; baseline unitário: 423/423; após otimização, visão: 24/24 e builder: 21/21. Detalhes, limitações e diagnóstico da concorrência estão em [analysis/met19-dataset-validation.json](analysis/met19-dataset-validation.json); custo medido em [analysis/met19-dataset-benchmark.json](analysis/met19-dataset-benchmark.json).
