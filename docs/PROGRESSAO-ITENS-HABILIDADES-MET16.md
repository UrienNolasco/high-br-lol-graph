# Compras observadas e timing de habilidades — MET-16

`GET /api/v1/matches/:matchId/progression/:puuid` entrega B02/B04 v1 para um participante. A consulta usa `MatchEventProjection` v1, `MatchTimelineProjection` v1, `MatchParticipant.finalInventory` e o marcador real de processamento, na mesma transação repeatable read. Não lê `MatchRaw`, não chama Riot, não busca catálogos pela rede e não reconstrói o inventário final a partir de compras. Partida/participante inexistente retorna 404.

`finalInventory` é sempre a projeção autoritativa MET-06: sete slots, roleBoundItem separado, origem, razões e cobertura. `trajectory` é uma interpretação do histórico observado e pode divergir do inventário final. `finalInventoryReconciliation` compara quantidades observadas e slots finais; diferença ou escopo desconhecido não altera nenhuma das fontes. roleBoundItem é excluído da comparação quando seu escopo de slot é ambíguo; divergência conhecida torna stateComplete=false. Uma diferença não é corrigida copiando slots finais para dentro da trajetória. A trajetória não representa posição dos itens nos slots nem identifica cópias físicas de itens iguais.

## Evidências, completude e versões

`originalItemEvents` e `originalSkillEvents` preservam identidade `matchId:frameIndex:eventIndex`, timestamp, payload integral e qualidade de origem. Nenhum undo apaga a compra/venda original. Em particular, `beforeId`, `afterId` e `goldGain` permanecem no payload, inclusive zero e ouro negativo. Timestamps iguais não são deduplicados; somente identidades exatamente iguais são contadas uma vez e sinalizadas. Identidades conflitantes invalidam a interpretação.

Ordenação: timestamp crescente e desempate frameIndex/eventIndex. Eventos sem timestamp aparecem ao final com null, sem horário artificial. `ordinal` da skill é a posição nessa apresentação, não garantia de ordenação cronológica quando falta timestamp. Eventos sem participante resolvido ficam em `unattributedEvents` e nunca são atribuídos a um participante 0; tipos futuros incrementam qualidade sem interpretação presumida.

Proveniência exige status COMPLETED, processingVersion >=2, completedAt real, eventos da mesma geração e `metricVersion=1`. Gerações posteriores são aceitas se mantiverem a versão suportada das projeções. Sem esses dados ou sem exatamente um `GAME_END` válido, `trajectory` e `skillSequence` são null, com motivo global e datas/versões realmente observadas ou null. `gameDuration` não substitui um fim observado para provar completude. Eventos originais e inventário final continuam disponíveis. Não há timestamp de processamento fabricado.

Esta entrega não muda dados persistidos nem exige migration/rebuild novo. Partidas anteriores à fundação precisam do rebuild offline MET-04/06; GET nunca faz backfill. Definição de métricas e regras interpretativas: versão 1.

## Trajetória de itens

A unidade básica é um grupo de eventos do mesmo participante no mesmo timestamp. O multiconjunto soma compras (+1) e vendas/destruições (-1) **simultaneamente**, preservando todas as linhas. Assim, um elixir com ITEM_DESTROYED antes de ITEM_PURCHASED no mesmo timestamp não permanece artificialmente no estado observado. Duplicatas de itemId representam quantidades; não são seis últimas compras distintas.

Destruição é uma remoção observada. Sozinha não prova consumo, transformação ou vínculo causal com outra compra. Metadados `from`, `into`, `tags`, `consumed` e `consumeOnFull` vêm do catálogo compatível, com ausência preservada. Uma receita compatível contextualiza as remoções simultâneas; não substitui eventos ausentes nem remove componentes que a timeline não registrou.

Undo suportado exige a última transação ainda ativa na pilha e campos completos/consistentes:

- Compra única → `beforeId=itemId`, `afterId=0`, goldGain >=0. Sem destruições associadas, desfaz apenas essa compra. Com destruições simultâneas, restaura o estado anterior somente quando todos os IDs removidos cabem na árvore de componentes do catálogo compatível; multiplicidade é preservada. A compra original recebe `effective=false` e referência `undoneBy`.
- Venda única → `beforeId=0`, `afterId=itemId`, goldGain <=0. Restaura o estado anterior daquela venda, sem criar uma nova compra nem mudar seu horário original.
- Undo sem correspondência, ambos IDs não zero, grupo com undo misturado a outras operações, receita não validável, campos inválidos ou timestamp ausente: estado ambíguo. Quantidades que não podem ser reconstruídas tornam-se null, inclusive o saldo prévio de novos IDs observados depois de undo desconhecido; compras possivelmente afetadas têm efetividade desconhecida. Não é inferida uma transformação nem uma restauração arbitrária de componentes.

`goldGain` é evidência original; não se transforma em preço de catálogo, ouro líquido ou soma de despesas. Destruição sem aquisição observada gera `removal_without_observed_acquisition`, quantidade null e estado incompleto, em vez de estoque negativo ou item presumido. Causas desconhecidas são mantidas como tais.

`trajectory.acquisitions` mantém todas as compras, inclusive desfeitas. Venda/destruição posterior não desfaz o fato de que uma compra ocorreu; por isso ela pode continuar efetiva e não estar mais no estado observado. `observedInventory` contém quantidade por ID, incluindo zero observado e null desconhecido; nunca deve substituir os slots autoritativos de `finalInventory`.

`itemTimings[].firstEffectiveObservedAt` é o menor timestamp, em milissegundos, dentre compras observadas do item que não foram canceladas por undo suportado. É uma aquisição **observada**, não garantia de primeira aquisição real num histórico incompleto, item ainda mantido ou build adequada. Se todas foram desfeitas, o tempo é null; se há efetividade/timestamp ambíguo, fica indisponível. `effectivePurchaseCount` é contagem de compras efetivas, não quantidade atual. O envelope B02 inclui unidade, janela, qualidade N, versão e evidências de compra/remoção/undo. Cobertura conta aquisições com timestamp e classificação conhecidos, incluindo compras comprovadamente desfeitas.

## Habilidades e catálogo por patch

Cada alocação conserva timestamp, skillSlot, levelUpType e identidade. B04 `allocationAt` é o horário observado; `sincePreviousAllocation` é o intervalo para a alocação observada anterior, não tempo de reação nem atraso após ganhar um ponto. Primeiro intervalo ou timestamp ausente retorna null; timestamps iguais produzem intervalo zero válido. `observedNormalRank` conta apenas eventos NORMAL registrados para o slot; evolução/tipos futuros não são convertidos em rank NORMAL. Se alguma alocação tem timestamp inválido/ausente, rank ordenado não é validado (incomplete_allocation_order).

A validação usa o catálogo do **mesmo major.minor interno** e campeão: slots existentes e máximo `maxrank` publicado. Sem catálogo, com patch diferente, campeão desconhecido, tipo não suportado ou campo ausente, a validação informa o motivo; não usa `champions.json` atual como catálogo histórico. Não valida regras de desbloqueio por nível, exceções/evoluções de campeões ou eficácia do uso. Os eventos são alocações, não casts.

`levelContext` vem do último snapshot anterior ou igual ao evento, com tolerância de 60s, frameIndex, timestamp e offset. Nunca escolhe frame futuro nem interpola nível. É contexto amostrado; não prova o nível exato da alocação. Ausência de snapshot/nível é explícita e não apaga o evento.

A política de catálogo é `latest_revision_of_exact_patch`, preservando a convenção MET-06. A documentação oficial descreve dados estáticos versionados e arquivos específicos de campeões, incluindo informações de habilidades; isso não fornece todas as regras de jogo para validação causal ou de desbloqueio. [Riot: Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon).

`getCachedItemCatalog` e `getCachedSkillCatalog` são estritamente sem rede. O serviço de relatório chama somente esses métodos. Carregamento explícito fora do GET de relatório é feito por `getItemCatalogForGameVersion` e `getSkillCatalogForGameVersion`; o último resolve versões, índice de campeões e arquivo do campeão, com timeout5s/limite5MB por GET, até três GETs, deduplicação de chamadas simultâneas e cache1h (falha1min). Cache frio deixa metadados/validação indisponíveis; não dispara download na leitura. Não há endpoint novo de aquecimento nem aquecimento automático nesta task. Os metadados de receitas são aditivos ao catálogo de itens existente; nomes/URLs mantêm o contrato MET-06.

## Verificação e compatibilidade

A rota nova é aditiva. `/builds` mantém o inventário final autoritativo e a representação legada de transações; consumidores que precisam de undo completo devem usar esta rota. Não há score de build/eficácia nem inferência de intenção, premade ou causalidade.

Fixture real BR1_3200579475: 41 frames; 292 compras (duas sem participante atribuível), 277 destruições, 19 vendas, 18 undo e 177 alocações NORMAL. Os dez relatórios preservam 604 eventos de itens atribuídos e 177 habilidades; os dois eventos sem autor permanecem separados. Os sete slots finais de todos os participantes são confrontados com o resumo. Testes sintéticos cobrem componentes duplicados, consumo simultâneo, venda/undo, múltiplos undo em pilha, transformação não suportada, catálogo ausente/errado, campos inválidos/ausentes, tipos futuros, gerações posteriores, identidades duplicadas/conflitantes e rank acima do máximo do catálogo.

Comandos: `npm test -- --runInBand`; `npm run build`; `npm run test:e2e -- --runInBand --testPathPatterns=progression-contract`; integração serial e coordenada `npm run test:integration -- --testPathPatterns=progression.integration-spec.ts` com TEST_DATABASE_URL descartável. A integração remove MatchRaw após ingestão e lê as projeções reais com catálogo offline; também verifica ausência de completedAt. Testes não baixam metadados externos; catálogos de validação são explicitamente sintéticos, sem declarar validação de catálogo real para a fixture.

Evidência final: build e lint direcionado aprovados; regressão inicial de 337 testes unitários em 69 suítes, seguida de 27 testes focados após ajustes de fim observado/ambiguidade; HTTP final 3/3 via MatchesModule real (5,686s); integração PostgreSQL final 1/1 (6,651s). [Auditoria da fixture](analysis/met16-progression-validation.json) registra as contagens, cobertura dos slots e ambiguidades sem alegar disponibilidade do catálogo real no ensaio offline.
