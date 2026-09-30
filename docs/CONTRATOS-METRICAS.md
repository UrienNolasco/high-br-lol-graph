# Contratos executáveis de métricas — MET-01

Implementação: `src/modules/matches/contracts/metric-contract.ts`, com regras
temporais e de elegibilidade nos contratos do módulo de matches e matemática
genérica em `src/lib/math/`. Estes contratos concretizam a seção 11 de
`METRICAS-E-OPORTUNIDADES.md`; nenhuma projeção persistida muda nesta task.

## Valores e resposta

`MetricResult` é uma união discriminada. `observed` significa campo direto, `derived` cálculo determinístico, `estimated` proxy/convenção, `unavailable` ausência. Só unavailable admite valor null, sempre com reason; resultados disponíveis carregam method e reason null. `metricValue` rejeita NaN/Infinity como `invalid_value` e transforma campo ausente em `missing_field`. Zero exige uma observação/cálculo válido e nunca preenche ausência. Um cálculo válido pode resultar em zero, inclusive diferenças e razões.

Cada resultado informa metricId (ID do catálogo), metricVersion, matchId, subject, unit, window, denominator, quality, evidence, processingVersion e processedAt ISO. Não arredondar até a apresentação. Percentuais usam 0–100; shares 0–1; razões gerais podem exceder um. `ratioMetric` publica o denominador numérico e sua população/unidade, não divide por zero e normaliza entradas inválidas para null com `invalid_value`, evitando NaN serializado silenciosamente.

Qualidade tem contagens válidas/totais, coverage (válidas/totais ou null sem população), eventos desconhecidos e divergências. Cobertura zero significa população conhecida sem observações válidas. Evidência aponta campo/valor, evento ou frame/timestamp sem entregar o payload inteiro. A origem `estimated` exige método explícito como qualquer valor disponível. Não usar a cobertura de um campo como cobertura de toda a partida.

As quatro respostas sintéticas executáveis estão em `metric-examples.ts` (`METRIC_RESPONSE_EXAMPLES`). `MetricResultDto` é registrado em components/schemas do OpenAPI da API; components/examples contém os quatro exemplos (`METRIC_OPENAPI_EXAMPLES`). São contratos reutilizáveis para as novas rotas de MET-17; não constituem amostras reais nem uma rota de relatório já implementada.

## Tempo e denominadores

Frames/eventos, alvos e janelas usam milissegundos desde o início. Duração e timePlayed do resumo usam segundos; converter explicitamente. Taxas usam segundos/60; ouro-minuto é a unidade da integral; somas de tempo morto do time usam jogador-segundos. Não usar índice como duração. Quando GAME_END validado estiver disponível, seu timestamp define o fim observado: gameDuration em segundos pode ser truncado e não deve eliminar o último frame.

`selectCheckpoint` aceita nearest (descrição) ou pastOnly (feature até t), com tolerância inclusiva de 60.000 ms por padrão. Nearest minimiza distância absoluta, desempata pelo timestamp anterior, depois frameIndex e ordem de entrada; pastOnly nunca considera timestamp > alvo. Retorna timestamp real, offset assinado, modo e tolerância; não interpola. Frames inválidos ou além do fim observado não entram. Fim anterior ao alvo resulta short_match mesmo com frame final próximo; demais ausências são missing_frame. Campos ausentes dentro do frame selecionado continuam ausentes, sem buscar silenciosamente outro frame.

`temporalWindow`/`containsTimestamp`: fases `[início,fim)`, última fase `[]` incluindo GAME_END validado, pré-captura `[t−w,t)`, pós-captura `(t,t+w]`. Janelas extrapolando início/fim ficam censuradas e expõem intervalo observado/duração efetiva. A função mantém evidências parciais; consumidores excluem essas janelas de denominadores que exigem horizonte completo.

Denominadores de família: C07 conta mortes elegíveis, cada uma pode ter várias evidências de objetivos; O05 conta eventos de abate, sem alegar independência; V05 distingue gaps internos e bordas; histórico conta partidas distintas; posição amostrada conta snapshots válidos. Média de razões e razão de somas são métricas diferentes. DPM legado é média por partida com mesmo peso por jogo, não razão dos totais acumulados.

## Coorte, papel e remake

`INITIAL_COHORT`: BR, queueId 420, mapId 11. `Cohort` preserva null explícito para dados desconhecidos, incluindo collectionSource. `CohortFilter.dimensions` omite uma chave para permitir todos os valores e usa null para selecionar desconhecidos; filtros por versão e patch são exatos. Período é `[fromMs,toMs)`. `selectCohort` deduplica por matchId depois de filtrar, ordena gameCreation DESC/matchId ASC e publica eligibleN, returnedN, limite efetivo pelo número retornado e truncated. Comparações de participante devem passar registros do mesmo sujeito; linhas de jogadores diferentes não são intercambiáveis. Métricas de checkpoints devem publicar seu próprio N válido além do N da coorte.

`normalizeRole` aceita MID como MIDDLE; valor original permanece no registro fonte (não sobrescrevê-lo para auditoria). Papel desconhecido não vira TOP. `selectUniqueOpponent` exige exatamente um adversário em time conhecido (100/200) com papel canônico igual; zero dá missing_opponent, multiplicidade dá ambiguous_role. Ausência de role não bloqueia métricas de time.

`gameVersionPatch` extrai chave interna major.minor sem tratar 16.2 como 16.20, sem inferir rótulo público ou predecessor. Regras de remake são registradas por patch em `REMAKE_RULES`, com versão e evidência. Matriz atual:

| Patch interno | Evidência | Resultado |
| --- | --- | --- |
| 16.2 | Fixture BR1_3200579475, dez flags gameEndedInEarlySurrender=false | not_remake; surrender=true é aceito separadamente |
| 16.2, flag ausente/true/incompleta | Sem fixture positiva validada | unknown_remake; não elegível para coorte que exclui remake |
| Demais patches | Sem regra validada | unsupported_version; não elegível para essa coorte |

Essa regra suporta apenas classificação negativa a partir dos flags completos; não valida a semântica de todos os jogos do patch. Não há limiar de duração inventado, nem equivalência entre early surrender e remake. Jogo curto com flags negativos pode ser not_remake e ainda ser short_match para @15. Nova regra positiva exige evidência adicional, versão e testes antes de substituir unknown. `assessRemake` expõe status, eligible, reason, ruleVersion e evidence; unknown pode continuar disponível para descrição individual, desde que não seja contado silenciosamente na população histórica filtrada. A auditoria multiversão MET-02 delimita a ampliação do suporte.

## Versão e compatibilidade

metricVersion identifica uma definição/fórmula/regra temporal. processingVersion identifica a geração das projeções/contadores persistidos. METRIC_VERSION=1 inicia o contrato; PROCESSING_VERSION=1 permanece porque esta task não altera resultados persistidos. Mudar fórmula persistida exige incrementar ambas as versões pertinentes e rebuild offline transacional conforme `PROCESSAMENTO-CONFIAVEL.md`; reentregar job COMPLETED não faz rebuild. Um consumidor não mistura versões de métricas em agregados.

O @15 legado é explicitamente `LEGACY_LANE_CHECKPOINT` metricVersion=0: primeiro frame em `[900000,960000)`. A agregação existente referencia essa constante preservando resultado e ordem anteriores. Nearest/pastOnly são definições novas e não substituem @15 silenciosamente. Rotas atuais continuam com seu formato; novas respostas usam extensão compatível ou rota versionada se mudar semântica/nulabilidade. Correções específicas são MET-07/08 e integração do relatório é MET-17.

## Validação

`npm test -- --runInBand src/modules/matches/contracts src/modules/matches/dto`
cobre serialização de quatro estados, zero válido, ausência, denominador
zero/inválido, precisão, frames futuros/ausentes/duplicados, fim de jogo,
bordas/censura, role ambígua, coorte ordenada/deduplicada e patches
desconhecidos. `npm run build` valida integração Nest/OpenAPI. Dados e
exemplos sintéticos estão explicitamente identificados. Não há migration ou
rebuild nesta task, pois não muda o schema nem o significado de valores
persistidos.

## MET-13: combate e solo histórico

[Contrato completo de combate](COMBATE-MET13.md): `GET /api/v1/matches/:matchId/combat`, envelopes E08/C01/C08/C09 v1, relações com cobertura e identidade de evento, contagens solo por partida e médias históricas com N válido. Campos novos de ausência: `missing_projection`, `unknown_assistance`, `incomplete_events`. `bounty` e `shutdownBounty` permanecem separados. Consultas exclusivamente em projeções MET-04; assistência omitida não equivale a array vazio.
## MET-16: itens e habilidades

[Contrato da progressão observada](PROGRESSAO-ITENS-HABILIDADES-MET16.md): B02/B04 v1 em `GET /api/v1/matches/:matchId/progression/:puuid`, transições completas com undo preservado, aquisições efetivas observadas e alocações de habilidade. Inventário final permanece autoritativo; receitas/skills usam apenas cache do patch compatível no GET. Ambiguidade e ausência de proveniência são explícitas, sem eficácia inferida.

## Relatório integrado MET-17

[Contrato e navegação](RELATORIO-PARTIDA-MET17.md): `GET /api/v1/matches/:matchId/report/:puuid` e subrotas metrics, evidence, episodes e families. Quatro dimensões equivalentes, páginas com total/hasMore/next, modos preservados nos links, limites e 400/404 explícitos. Cada requisição compartilha uma leitura RepeatableRead, exclusivamente projeções e catálogos cached-only. Totais finais observados admitem proveniência nula no envelope específico do relatório; ausência de processamento não fabrica MetricResult. Rotas prévias permanecem compatíveis. [Exemplos com metadados de processamento sintéticos identificados](analysis/met17-report-examples.json).

## Indicadores opcionais MET-29

[Catálogo e histórico C12/B06/B07](INDICADORES-OPCIONAIS-MET29.md): rotas aditivas `GET /api/v1/indicators/catalog`, `/api/v1/matches/:matchId/indicators/:puuid` e `/api/v1/players/:puuid/indicators`. Contadores finais opcionais preservam ausência e zero; frequências usam timePlayed observado. Histórico com cursor criação/ID, N limitado à página, coortes por campeão/posição/patch/versão e nenhum percentil presumido. Sem novo schema ou geração, sem bruto/rede nos GETs. [Exemplos e cobertura por campo/versão](analysis/met29-optional-indicators-examples.json).
