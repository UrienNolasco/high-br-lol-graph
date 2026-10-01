# Episódios de abates e trocas rápidas — MET-24

`GET /api/v1/matches/:matchId/kill-episodes` publica C11 (episódios de abates), C10 (troca rápida regional) e E06 (recurso anterior ao episódio). São análises exploratórias: não identificam toda teamfight, luta sem mortes, iniciação, peel ou intenção de um jogador. A resposta contém interpretação, evidências por identidade de evento e sensibilidade aos limiares. Não há nota de luta nem afirmação causal.

## Fontes e população

A rota lê somente projeções da partida solicitada, em uma transação RepeatableRead: Match/MatchParticipant para identidade e reconciliação de abates/mortes, MatchEventProjection para abates e contexto de término/tipos desconhecidos, MatchTimelineProjection para snapshots e MatchProcessing para proveniência. Não acessa MatchRaw, não descomprime bruto nem consulta Riot/Data Dragon. A semântica de autor/vítima/assistente reutiliza `prepareCombat` de MET-13; o recurso usa os frames completos de MET-03. O serviço exportado e as funções puras são reutilizáveis por relatórios.

metricVersion/definition.version=1 versionam este algoritmo e seus limiares, independentemente da geração de processamento. processingVersion/processedAt vêm do job COMPLETED, nunca do relógio do GET. Sem proveniência, report=null/missing_projection; sem partida, 404. Geração incompatível, mapId diferente de11 e identidade duplicada são explicitamente indisponíveis. As distâncias são unidades euclidianas do mapa, não pixels de uma imagem nem distância de deslocamento pelo terreno.

Cada CHAMPION_KILL com timestamp e posição válidos até o término observado é elegível ao agrupamento. Evento sem posição/tempo não recebe coordenada presumida: aparece em unassigned com identidade e motivo. Eventos ambientais com killerId=0 continuam sendo mortes localizadas, mas não entram em pares de resposta entre jogadores. Somente autores/vítimas/assistentes registrados e resolvidos formam participantPuuids; é uma seleção retrospectiva de membros, não prova de todos os presentes nem feature prospectiva disponível antes do episódio.

coverage informa eventos fonte/atribuídos/excluídos, assistência e times desconhecidos, término observado e reconciliação com abates/mortes finais. Ausência do GAME_END, abates finais não reconciliados ou eventos não localizáveis tornam episodeCount/quickTradeCount indisponíveis; os episódios do subconjunto observado continuam auditáveis. Para C10, time de autor/vítima desconhecido também impede uma contagem global, com tradeReason separado. Assistência desconhecida limita membros registrados, sem impedir agrupar uma morte cuja posição e tempo são conhecidos. Um jogo com término observado e zero mortes reconciliadas pode ter contagem zero válida.

A qualidade de C11 conta eventos localizados/eventos fonte; C10 conta eventos não ambientais com localização e ambos os times conhecidos/eventos não ambientais fonte. O saldo usa campos de time conhecidos/2×eventos do episódio. Os totais finais entram somente na checagem de completude, nunca para preencher recurso anterior ou atribuição desconhecida.

## C11 — algoritmo determinístico

Os eventos são ordenados por timestamp, frameIndex, eventIndex e identidade textual. Para cada abate, são candidatos os episódios já iniciados que satisfaçam simultaneamente:

1. tempo desde o último evento ≤ gapMs;
2. tempo desde o primeiro evento ≤ maxSpanMs;
3. distância para **cada** evento do episódio ≤ diameterUnits.

Escolhe-se o candidato com menor distância máxima ao novo evento, depois menor gap, depois identidade estável do episódio. Sem candidato, começa um novo episódio. Não há união posterior nem dupla atribuição. O critério espacial completo e o limite de duração evitam uma cadeia ilimitada de abates próximos apenas ao vizinho imediato. Eventos simultâneos distantes ficam separados; eventos simultâneos próximos podem compartilhar um episódio. As fronteiras são inclusivas.

A identidade do episódio contém versão, perfil e identidade do primeiro evento. A janela é [primeiro,last timestamp], fechada; duração=último−primeiro. Os eventos observados têm identidade/fonte/posição próprias. killEvents e a contagem de episódios têm origin=estimated porque a agregação como episódio depende de limiares exploratórios. Não são rótulos de luta validados.

Por time, killsRegistered/deathsRegistered são registros conhecidos; net=abates−mortes apenas com atribuição completa dos dois times, em count, sem denominador. Net negativo é válido. Ausência de autoria/vítima mantém net=null. Nenhum saldo descreve quem venceu uma luta completa nem seu impacto causal na partida.

## C10 — resposta rápida sem dupla atribuição

O padrão procura um abate adversário **estritamente posterior**, com latência em (0,10000]ms e distância≤2000, cujo time autor seja o time da vítima anterior e cujo time vítima seja o time autor anterior. Não se exige matar o mesmo autor; killedOriginalAuthor apenas compara identidades. É uma resposta regional do time, não evidência de vingança ou intenção.

Respostas são processadas cronologicamente. Havendo várias mortes elegíveis sem par, escolhe-se a mais recente, depois menor distância, depois identidade textual. Cada evento é consumido uma única vez em qualquer papel: não pode responder a duas mortes nem, após ser usado como resposta, originar outro par. Eventos simultâneos não recebem uma ordem causal por índice de origem. Pares podem cruzar episódios do agrupamento, pois são uma definição independente; ambos os IDs de episódio são fornecidos. Cada par expõe eventos, latência, distância e evidência.

## E06 — snapshot anterior, idade e ausência

Seleciona-se o frame global de maior timestamp **estritamente menor** que o início do episódio; timestamp igual é excluído para não incluir efeitos de um abate no mesmo instante. Empate de timestamp usa maior frameIndex. Não se escolhe um frame por campo/participante: se o participante ou campo falta no frame selecionado, não há backfill de um frame mais antigo. Nenhuma leitura futura ou valor de fim do episódio preenche o recurso anterior.

ageMs=início−timestamp selecionado; maxAgeMs=60000 em todos os perfis. Frames mais velhos ficam stale=true: idade/identidade/evidência observada permanecem, mas valores de recurso ficam unavailable/missing_frame. Sem frame anterior (inclusive episódio no instante0), ausência é explícita. Projeção desconhecida, campo ausente/número inválido ou identidade duplicada têm motivos próprios.

currentGold e totalGold são observações do frame, com janela pontual [timestamp,timestamp], unidade gold e evidência. unspentGoldProxy usa o currentGold anterior como estimativa do recurso antes do episódio, origin=estimated; não é inventário/caixa exato naquele segundo nem ouro desperdiçado. unspentShare=100×currentGold/totalGold, unidade percent, denominador explícito do mesmo participante/frame. Zero observado é válido; denominador zero ou ausente produz null. A qualidade conta operandos válidos, não tamanho de coorte histórica.

## Sensibilidade publicada

Os três perfis fixos fazem parte da definição1; não são parâmetros ajustados para obter um resultado desejado.

| Perfil | gap | span máximo | diâmetro | troca | distância da troca | idade máxima snapshot |
|---|---:|---:|---:|---:|---:|---:|
| tight | 7,5s | 15s | 1250 | 5s | 1250 | 60s |
| default | 15s | 30s | 2000 | 10s | 2000 | 60s |
| loose | 22,5s | 45s | 3000 | 15s | 3000 | 60s |

Para cada perfil a resposta publica contagem de episódios/trocas do subconjunto observado, episódios com múltiplos abates, maior episódio e mudanças relativas ao padrão. coClusterPairChangesFromDefault conta a diferença simétrica entre pares não ordenados de eventos no mesmo episódio; não compara IDs de episódio, que mudam com o perfil. quickTradePairChangesFromDefault compara pares ordenados morte/resposta. São medidas descritivas de estabilidade de atribuição, não intervalos de confiança nem validação contra labels humanos. Dados ausentes e cobertura permanecem explícitos na sensibilidade.

Na fixture, tight produz 74 episódios/8 trocas; default, 62/11; loose, 53/16. A diferença de pares no mesmo episódio é 28 no perfil tight e 21 no loose em relação ao padrão. Esses resultados descrevem sensibilidade da definição e não escolhem um perfil como verdade de combate.

## Verificação reproduzível

```sh
npm run build
node scripts/validation/validate-kill-episodes.cjs
npm test -- --runInBand kill-episode episode-resources
npm run test:e2e -- --runInBand kill-episodes-contract
```

[analysis/met24-kill-episodes-examples.json](analysis/met24-kill-episodes-examples.json) contém a análise da fixture16.2/420/11, os três perfis e um episódio/par com evidências. Metadados offline são sintéticos e identificados; a API usa os reais. O script confere92 abates atribuídos exatamente uma vez, snapshots estritamente anteriores, idade correta e eventos não reutilizados em trocas. A amostra de uma partida não calibra limiares para toda a população ou todos os patches.

Testes cobrem simultaneidade/distância, fronteiras inclusivas de gap/span/diâmetro e troca, prevenção de cadeias e dupla atribuição, ordenação invariável, sensibilidade, ausência de localização/terminal/metadados, mapa/geração desconhecidos, mortes ambientais e times não resolvidos. E06 cobre frame igual/futuro, frame faltante/antigo, ausência por participante/campo, zero/denominador zero e versão desconhecida. HTTP atravessa controller/repositório/serviço/cálculo reais com apenas Prisma substituído; verifica snapshot consistente, seleção exclusiva de projeções, indisponibilidade,404 e OpenAPI. Não há nova persistência, migration, PROCESSING_VERSION ou rebuild; MET-03/MET-13/MET-09 validam as fontes persistidas.

Gates desta entrega sobre a base 5b203bd: build aprovado; 352 testes unitários (72 suítes) e 83 HTTP (17 suítes) aprovados. Reconciliador: 92 eventos únicos, 239 snapshots de participantes verificados, zero leitura futura e zero reutilização de evento em trocas. Não houve acesso ao banco nesta tarefa.
