# Contadores opcionais de execução, casts e pings — MET-29

MET-29 publica descrições C12/B06/B07 por partida e histórico usando somente projeções existentes. Não altera processamento, banco ou geração 4. A referência é o contador final registrado, sem nota de habilidade, qualidade de comunicação ou avaliação moral.

## REST v1 e compatibilidade

| Rota | Contrato |
| --- | --- |
| `GET /api/v1/indicators/catalog` | Catálogo v1, nome, campo, fonte, unidade, validação e limitações |
| `GET /api/v1/matches/:matchId/indicators/:puuid` | Contadores opcionais e frequências, com evidência/proveniência; aceita apenas `family` |
| `GET /api/v1/players/:puuid/indicators` | Histórico descritivo limitado e paginado, separado por coorte exata |

`family` admite `execution`, `casts` ou `pings`; omitir seleciona as três. Campo ausente é `value=null`, `origin=unavailable`, motivo explícito. Zero numérico observado permanece zero. Partida/jogador ausente retorna 404; histórico sem partidas retorna 200 com N=0 e grupos vazios. Consultas inválidas retornam 400. São rotas aditivas; respostas anteriores de partidas, comparação, relatório e dataset não mudam.

## Catálogo v1

Todos os campos são **opcionais**, unidade literal `count`, aceitando apenas inteiros finitos não negativos dentro do intervalo seguro de JavaScript. String numérica, número negativo, fracionário ou não finito não vira contador válido. Nomes descrevem o campo Riot; não validam regras ocultas de atribuição do challenge.

| Oportunidade / fonte | Campo | Nome público |
| --- | --- | --- |
| C12 / `MatchParticipant.challenges` | skillshotsHit | Skillshots acertados registrados |
| C12 / challenges | skillshotsDodged | Skillshots desviados registrados |
| C12 / challenges | outnumberedKills | Abates em inferioridade numérica registrados |
| C12 / challenges | saveAllyFromDeath | Salvamentos de aliado registrados |
| B06 / `finalStats.values` v1 | spell1Casts, spell2Casts, spell3Casts, spell4Casts | Casts do slot 1, 2, 3, 4 |
| B06 / `finalStats.values` v1 | summoner1Casts, summoner2Casts | Casts do feitiço de invocador 1, 2 |
| B07 / `MatchParticipant.pings` | allInPings | Pings de avançar com tudo |
| B07 / pings | assistMePings | Pings de assistência |
| B07 / pings | basicPings | Pings básicos |
| B07 / pings | commandPings | Pings de comando |
| B07 / pings | dangerPings | Pings de perigo |
| B07 / pings | enemyMissingPings | Pings de inimigo desaparecido |
| B07 / pings | enemyVisionPings | Pings de visão inimiga |
| B07 / pings | getBackPings | Pings de recuar |
| B07 / pings | holdPings | Pings de manter posição |
| B07 / pings | needVisionPings | Pings de necessidade de visão |
| B07 / pings | onMyWayPings | Pings de a caminho |
| B07 / pings | pushPings | Pings de avançar |
| B07 / pings | retreatPings | Pings de retirada |
| B07 / pings | visionClearedPings | Pings de visão removida |

São 24 definições (4 challenges, 6 casts, 14 pings). `metricVersion=catalogVersion=1` é a versão desta definição. `finalStats.projectionVersion=1` identifica a projeção MET-05; challenges/pings são JSON de resumo já persistidos, sem inventar uma versão de storage inexistente. Campos fora deste catálogo não são promovidos automaticamente: `unknownFields` informa total, os primeiros 20 nomes ordenados e truncamento, sem afirmar que outros campos Riot são inválidos. Não somamos categorias de ping, pois não há garantia de que sejam mutuamente exclusivas.

O corpus real disponível valida presença/tipo dos campos somente na partida BR1_3200579475, versão **16.2.741.3171** (patch 16.2). `fixture_validated` significa reconciliação com esse corpus, não validação semântica universal. Outros patches preservam observações literais dos campos conhecidos, com `unvalidated_patch` / `patch_not_in_validation_corpus`; gameVersion não interpretável explicita `unsupported_version`. Os estratos históricos incluem gameVersion completa e geração de processamento, e não misturam versões para criar referência. Casos de outros patches nos testes são sintéticos.

A [auditoria por campo e versão](analysis/met29-optional-indicators-examples.json) registra N observado/ausente e zeros dos dez participantes. A extração legada de pings armazenava apenas valores numéricos; um valor não numérico descartado na ingestão não pode ser distinguido de ausência nessa projeção. MET-29 não consulta o bruto para reconstruir essa informação.

## Fórmulas e interpretação

Para uma partida, `count.value` é o campo literal, com evidência `{source,field,value,matchId,puuid,href}`. O link permite recuperar a família completa do participante. Cada envelope traz ID de oportunidade, versão, valor/unidade, origem, motivo, método e qualidade.

A frequência B06/B07 é `contador / (finalStats.values.timePlayed / 60)`, unidade `count_per_minute`. O denominador é o **tempo jogado observado do participante**, nunca `gameDuration` como substituto. Duração ausente/inválida suprime apenas a frequência; duração zero continua visível e gera `zero_denominator`. O contador final ainda pode ser válido. A projeção final com versão não suportada não publica casts como se fosse v1.

C12 não tem frequência nem taxa de acerto: `skillshotsHit` não informa tentativas. Casts totais não produzem timestamps, cooldowns, oportunidades desperdiçadas ou rotação ótima. Pings não revelam intenção, toxicidade ou qualidade da comunicação. `window=null` e `temporalScope=final_summary_retrospective` deixam explícito que não existe um log temporal derivado desses contadores.

Contadores literais permanecem observáveis sem metadados de processamento, com `processingVersion=null` e `processedAt=null`. Não se fabrica um MetricResult processado. Frequências derivadas e aritmética histórica exigem job COMPLETED, geração >=2 e data real válida; ausência ou geração legada excluem a observação da aritmética, mantendo N total e motivo. MET-29 não recalcula ou altera o dataset persistido MET-19; reutiliza suas regras de normalização dos filtros e lê projeções finais já existentes para campos opcionais ainda não materializados nele.

## Histórico, coorte e paginação

Filtros normalizados compartilham a definição MET-19: `championId`, `role` (`MID` é `MIDDLE`), patch exato `major.minor`, `queueId` (padrão 420), `mapId` (padrão 11), intervalo de criação `[fromMs,toMs)` e `eligibleOnly` (padrão true, população elegível persistida). IDs de fila, mapa e campeão são inteiros positivos até 2147483647; limites maiores são rejeitados antes de consultar PostgreSQL. Não inferimos tier ou região histórica. `eligibleOnly=false` permite inspecionar as observações fora da população elegível; isso não cria elegibilidade para uma referência.

A consulta seleciona no máximo `limit` partidas (padrão 30, máximo 100), em `gameCreation DESC, matchId ASC`. Um registro adicional detecta `hasMore`. `selection.totalMatchingMatchPlayers` conta o histórico filtrado completo, enquanto `sample` e todos os N dos grupos descrevem **somente a página selecionada**. `truncated=true` indica que a seleção não representa o histórico completo. O cursor opaco inclui o par criação/ID e escopo dos filtros; mudar campeão, posição, patch, fila, mapa, período, jogador ou elegibilidade invalida o cursor com 400. `selection.next` preserva filtros e reinicia a página de grupos. Não há snapshot persistente entre requisições: novas partidas/reprocessamentos podem mudar páginas posteriores.

Agrupamos por campeão, posição normalizada, patch, gameVersion completa, fila, mapa, geração armazenada e estado da validação do catálogo. `groups` tem `items,total,offset,limit,hasMore,next`; `groupLimit` padrão 5/máximo 10 e `groupOffset` 0–100. Essa segunda paginação navega grupos da mesma página de partidas. Posição desconhecida ou patch não interpretável não geram médias comparáveis. Não há média geral que misture campeão/posição/patch, nem percentil populacional calculado com uma partida. `reference.percentile=null`, `reason=not_calculated` é intencional em qualquer N.

Para cada definição do grupo:

- Média de contador: `soma dos contadores válidos / N válido de observações únicas (partida,jogador)`; soma/valor ficam nulos se nenhuma observação for válida.
- Frequência histórica: `soma dos contadores dos pares válidos / soma dos minutos desses mesmos pares`. Um contador ausente não acrescenta minutos ao denominador; uma duração inválida não acrescenta contador ao numerador. Não usamos média simples de frequências por partida.
- Qualidade: N válido, N total e cobertura por medida, motivos de ausência, partidas e jogadores distintos. Duplicatas de identidade não multiplicam N. N de linhas não representa jogadores independentes.
- Proveniência: geração real, data única quando todas as fontes a compartilham, ou intervalo mínimo/máximo de datas com ausência explícita de data única. Não usamos o relógio do GET como data de processamento.

`evidenceLimit` é 0–3, padrão 3. O preview informa total/hasMore; `group.matches` lista todas as identidades selecionadas daquele grupo (no máximo 100) com links individuais para recuperar a evidência completa, inclusive campos indisponíveis. A página, filtros, grupos e evidências derivam da mesma transação `RepeatableRead`.

## Custos, testes e reprodução

Por partida lemos um participante, contexto da partida e job. Histórico lê um count agregado, até 101 participantes com contexto, e até 100 jobs. Não lê MatchRaw, frames, eventos, Riot ou CDN. Não altera migrations nem `PROCESSING_VERSION`. Uma página vazia não fabrica zeros ou estatística populacional.

Reproduzir exemplos offline: `npx ts-node scripts/audit-optional-indicators.ts`. A data/generation do artefato são metadados **sintéticos identificados**, e a variante de ausência é uma cópia sintética, não uma segunda partida real. O teste PostgreSQL usa metadados reais gerados pelo worker e remove os brutos antes da consulta.

Testes cobrem os 24 campos da fixture, ausência/zero/inválido, denominadores, proveniência desconhecida, separação de coorte/versão, aliases de posição, filtro de patch sem colisão com 16.20, cursor com empate na data, N distintos, paginação/limites, 400/404 e OpenAPI. A integração cria uma cópia sintética apenas para testar cursor SQL sem sobreposição. Não se alega validação de habilidade, comunicação, toxicidade ou resultado do jogador.
