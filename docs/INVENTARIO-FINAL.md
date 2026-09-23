# Inventário final e catálogo — MET-06 / B01

A rota existente `GET /api/v1/matches/:matchId/builds` agora usa `item0..item6` do resumo Match-V5 para o inventário final. O histórico de compras/vendas/undo continua em `itemTimeline`, explicitamente identificado como representação legada; não determina o inventário. MET-04/16 preservam e interpretam as transações completas.

## Fonte, slots e ausência

O parser grava `MatchParticipant.finalInventory` JSONB, version=1, dentro da mesma transação de MatchPersistenceService. A projeção contém sete entradas ordenadas por slot0..6 e roleBoundItem separado. Slots0..5 são itens, slot6 é trinket; IDs duplicados não são deduplicados. O campo final do resumo prevalece sobre compras, venda, destruição, transformação e undo observados na timeline. Não inferir item de quest a partir de compras nem inseri-lo em um dos seis slots.

ID0 é slot vazio observado, `empty=true`, origem observed. Campo ausente/null vira itemId=null, empty=null, origem unavailable e missing_field. ID negativo, não inteiro ou não finito gera invalid_value. Um ID desconhecido mas válido permanece com seu slot e ID; só metadata fica null. Cobertura `validSlots/totalSlots` conta os sete campos válidos, incluindo vazios observados; roleBoundItem tem estado próprio e não altera esse denominador. Não arredondar IDs/timestamps nem fabricar coordenadas.

Ausência da projeção em uma linha antiga retorna sete slots indisponíveis com missing_projection até rebuild; JSON de projeção inválido retorna invalid_projection. A rota não descomprime MatchRaw para improvisar inventário, nem reconstitui as últimas seis compras únicas. A fonte é sempre o resumo final e a janela é a partida completa. IDs e PUUID permitem navegar à evidência; a posição no array corresponde ao campo itemN original.

## Catálogo compatível

DataDragonService resolve a maior revisão disponível **dentro do mesmo major.minor interno** da gameVersion. `16.2.741.3171` pode resolver `16.2.1`; nunca `16.20.1` nem a primeira versão global atual. A resposta informa gameVersion, version efetivamente carregada, locale=pt_BR e policy=latest_revision_of_exact_patch. A política não converte números públicos de temporada/patch nem afirma equivalência exata entre build regional do cliente e Data Dragon.

A documentação oficial informa que um patch pode ter revisões adicionais do catálogo, recomenda a mais recente daquele patch e ressalva diferenças entre versão do cliente/região e Data Dragon. A correspondência exata major.minor é a convenção explícita desta implementação; regiões/versões sem correspondente ficam unsupported_version, sem recorrer a um catálogo atual. [Riot: versões e dados do Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon).

Metadados expostos: nome e URL versionada da imagem. Item inexistente no catálogo mantém ID e metadataReason=unknown_item_id. Slot0 vazio usa metadataReason=empty_slot; ausência de ID usa missing_item_id. Falha de rede retorna catalog_unavailable; JSON/versão inconsistente retorna invalid_catalog. Não transformar esses casos em item removido, nem inventar nome/preço. O inventário continua utilizável sem catálogo.

A rota de builds pode consultar os arquivos públicos Data Dragon, sem chave Riot: cada GET tem timeout5s e limite5MB. Chamadas concorrentes da mesma gameVersion compartilham a busca; cache local dura1h para sucesso e1min para indisponibilidade. Não há mutação de produção ou download obrigatório nos testes. `getCachedItemCatalog` é estritamente sem rede; o relatório MET-17 deve usar esse leitor ou metadados previamente carregados e aceitar indisponibilidade, nunca fazer a busca externa em tempo de leitura. O cache não é evidência histórica de rank ou disponibilidade no instante da partida.

## Compatibilidade e persistência

`finalBuild` mantém o nome, mas sua semântica é corrigida: retorna **sete slots com itemId nullable**, não seis compras. `roleBoundItem`, estados/razões, cobertura e catálogo são aditivos; clientes devem usar slot/kind e tratar null. `itemTimeline` permanece separado, com timestamp em ms e minute=timestamp/60000 apenas como conveniência. Não apresentar transações legadas como sequência completa de undo. Não há nota de qualidade de build nem recomendação causal.

Migration `20260923040000_met06_final_inventory` apenas adiciona coluna nullable; linhas existentes não são preenchidas com valores inventados. PROCESSING_VERSION=2 identifica a nova geração de projeções de fundação, compartilhada com MET-03/04/05. Aplicar migration antes do worker atualizado e reconstruir offline pelo runbook existente; redelivery de um job COMPLETED não faz rebuild. MET-09 integra o ensaio das quatro projeções. Rollback da aplicação preserva coluna e MatchRaw; não apagar dados para retroceder versão.

## Validação reproduzível

- `npm test -- --runInBand builds item-catalog match.parser match.repository`: dez participantes/70slots e10roleBoundItem reconciliados com a fixture; vazios, duplicatas, venda/undo, quest, ausência, IDs desconhecidos, patches16.2/16.20, revisão do catálogo, falha/cache e contrato do repositório.
- `npm run test:e2e -- --runInBand --testPathPatterns=builds-contract`: HTTP real com repositório/serviço, JSON nullable, ausência de catálogo,404 e OpenAPI.
- `npm run test:integration -- --testPathPatterns=inventory.integration-spec.ts`, com TEST_DATABASE_URL terminado em `_integration`: round-trip de todos os slots, redelivery idempotente, dois rebuilds idênticos, rollback de inventário com a partida e recuperação com campos ausentes. A suíte limpa apenas o banco isolado e deve ser serializada com as demais.

Os exemplos de nomes no teste de catálogo são sintéticos; nenhuma amostra real extra é alegada. O conjunto real validado é a fixture BR1_3200579475; IDs de patches futuros continuam presentes com metadado indisponível quando necessário.

Ensaio local em 2026-09-23: migration aditiva aplicada ao PostgreSQL isolado; 2 testes de integração aprovados em 5,428s, com 70 slots e 10 campos de quest reconciliados e dois rebuilds. Build, 277 unitários e 2 testes HTTP passaram. Consulta pública de catálogo para a versão real 16.2.741.3171 resolveu 16.2.1: 697 itens, todos os 54 IDs distintos não vazios da fixture encontrados. Esses números descrevem apenas o ensaio local.
