# Snapshots completos de timeline — MET-03

`MatchTimelineProjection` preserva uma projeção JSONB por partida, ligada por chave estrangeira a Match com exclusão em cascata. A identidade de frame é `(matchId, frameIndex)`; a de snapshot é `(matchId, frameIndex, participantId)`. Timestamp não é chave única: frames no mesmo minuto ou até no mesmo timestamp continuam distintos e na ordem original do payload.

## Conteúdo e ausência

`projectionVersion=1`, `frameIntervalMs` nominal e `observedEndMs` acompanham `frames`. Cada frame publica índice original, timestamp em ms e mapa de snapshots. Cada snapshot mantém participantId/PUUID, ouro total/atual, XP, nível, minionsKilled e jungleMinionsKilled separados, posição, todos os campos numéricos de damageStats/championStats (inclusive chaves novas) e campos restantes em additionalFields. Não calcular saldo com goldEarned−goldSpent. Estatísticas conhecidas ausentes/invalidas são null; valores zero observados permanecem zero. Objetos inteiramente ausentes são null. `missingFields` lista caminhos faltantes; ausência de um participante preserva a ausência da entrada inteira, sem inventar snapshot. `MatchRaw` continua intacto.

O worker aceita ausência/null de contadores opcionais do frame, mas rejeita identidade, timestamp e contador presente inválidos. Contadores faltantes no frame legado @15 não contribuem aos denominadores de lane. O novo parser não converte ausência em zero nas projeções. Os arrays antigos são uma adaptação separada, descrita abaixo.

A fixture real produz **41 frames e 410 snapshots**. Os índices 39/40 têm timestamps 2340765/2368922: ambos caem no minuto 39. O exemplo `docs/analysis/met03-snapshot-example.json` mostra o participante 1 nesses dois frames. A contagem de frames não equivale a duração observada contínua.

## Checkpoints e consultas

`snapshotCheckpoint` usa MET-01: nearest descritivo ou pastOnly, tolerância inclusiva 60 s, desempate pelo timestamp anterior e frameIndex. Retorna timestampMs, offsetMs, modo, tolerância e snapshot; não busca outro frame se o participante/campo estiver ausente. Partida encerrada antes do alvo dá short_match; falta de frame dá missing_frame; participante ausente dá missing_participant_frame. O último GAME_END com winningTeam conhecido define observedEndMs, preservando a fração de segundo que gameDuration pode truncar. Sem GAME_END validado, o chamador fornece duração em ms explicitamente.

Comparações MET-08 passam a ler MatchTimelineProjection exclusivamente para os matchIds já filtrados/limitados, dentro do mesmo snapshot RepeatableRead da coorte. `cohort.timelineSource=MatchTimelineProjection` e timelineReadN mostram a fonte. Nenhum GET de comparação descomprime MatchRaw. Projeção ausente dá missing_projection nos checkpoints, sem perder o resumo final conhecido.

Timeline de ouro O08 agora é metricVersion=2. Conserva rota/campos e acrescenta timestampMs/frameIndex a cada ponto; a série inclui todos os frames válidos, portanto minute pode se repetir. Consumidores devem usar timestampMs no eixo e frameIndex como identidade dentro da partida. Totais exigem cinco PUUIDs com observações válidas por time; campo ausente não vira zero. Vencedor continua exclusivamente MatchTeam.win. Máximo de vantagem inclui o timestamp exato. Swing compara frames adjacentes com tempo crescente e intervalo de no máximo 120 s; inclui variações no último minuto sem atribuir causalidade. Duplicatas simultâneas e lacunas maiores não formam pares avaliáveis. Esse limite é uma convenção versionada do O08 v2, não garantia de frequência da Riot.

## Compatibilidade e versão

Os Int[] legados goldGraph/xpGraph/csGraph/damageGraph continuam persistidos para os consumidores de detalhe antigos, por `legacyMinuteGraphs`. Política v0: `floor(timestamp/60000)`, último frame na ordem de origem vence dentro do minuto, índices/campos ausentes preenchidos com zero porque o contrato Int[] anterior não admite ausência. **Essa representação é declaradamente lossy e nunca alimenta as novas métricas ou comparação/ouro.** O @15 agregado anterior continua usando primeiro frame em [15,16) via LEGACY_LANE_CHECKPOINT, com contagem válida protegida contra falta de campo.

Dados já existentes não recebem projeção inventada pela migration. Até o rebuild, ouro retorna série vazia + missing_projection, mantendo o vencedor conhecido; comparação mantém resumo e informa ausência temporal. A API não tenta recuperar timestamps/ausências de arrays compactados. Schema e fórmulas novas exigem PROCESSING_VERSION=2. MET-09 coordena o rebuild completo dessa geração junto das demais novas projeções, sem deploy nesta task. Reentrega de COMPLETED continua idempotente, sem reprocessamento implícito.

## Persistência, medição e liberação

Migration aditiva `20260923120000_met03_timeline_snapshots` cria a tabela, PK e FK; não altera nem apaga dados antigos. Prisma registra a migration aplicada e `migrate deploy` subsequente não a reaplica. A projeção é inserida na mesma transação de participantes, times, agregados e estado COMPLETED. Falha posterior elimina o insert da projeção e Match. O rebuild existente apaga Match em uma transação inicial; a FK elimina projeções correspondentes, reconstruídas a partir do bruto em commits por partida.

Escolha física inicial: JSONB por partida permite recuperar um documento bounded sem 410 linhas/join e preserva objetos futuros. Leituras de coorte continuam limitadas a 100 partidas por jogador; leitura de detalhe usa PK matchId. Não adicionamos índices internos sem evidência de necessidade. Isso não afirma que JSONB será ideal para todas as consultas históricas; MET-19/33 medirão novas cargas antes de materializar outros recortes.

`test/integration/snapshots.integration-spec.ts` mede tamanho JSON/armazenado e dez leituras locais aquecidas do documento, com saída opcional `MET03_BENCHMARK_PATH`; o artefato anexado registra o ensaio executado. A transação medida inclui Match/participantes, mas usa agregado substituído para isolar a persistência do teste. Uma partida sintética e dez leituras não constituem orçamento de produção ou p95 confiável; MET-33 faz o benchmark de entrega.

No ensaio registrado em `docs/analysis/met03-snapshot-benchmark.json`: JSON 462.809 bytes; `pg_column_size(frames)` 109.613 bytes; transação 422,87 ms; dez leituras aquecidas entre 40,57 e 54,89 ms. O JSON inclui envelope e metadata de qualidade enquanto o tamanho PostgreSQL refere-se à coluna frames, logo não são medidas de um conjunto idêntico de bytes. O custo reforça manter consultas delimitadas e medir a carga completa em MET-33.

## Verificação reproduzível

```sh
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand --testPathPatterns='gold-timeline|comparison-contract'
# Somente com banco e RabbitMQ isolados e ambiente TEST_* configurado:
npm run test:integration
```

Testes da fixture comparam cada campo dos 410 snapshots, preservação da ordem/duplicatas, null versus zero, precisão decimal e stat futuro; checkpoints/censura; compatibilidade do último frame por minuto; ouro sem fonte; API real de comparação/ouro e schema. Round-trip PostgreSQL verifica igualdade de arrays e precisão, nulos, conclusão transacional e rollback após falha. Suite de processamento valida ingestão/reentrega, rebuild/resume e ausência opcional no @15 com denominador correto. Não houve uso de produção ou exclusão de payload bruto.
