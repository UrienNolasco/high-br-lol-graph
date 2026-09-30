# Referências por campeão e posição — MET-20 / H01, V08

`GET /api/v1/references` descreve uma subamostra histórica de participantes com o mesmo campeão, posição, patch, fila, mapa, definição e horizonte. Exige todas essas dimensões, publica cobertura e aplica um critério configurável de precisão antes de mostrar distribuição, mediana, quantis e percentil individual. Não produz tier, rank competitivo, causalidade nem uma referência representativa de toda a população.

## Consulta e fontes

```text
GET /api/v1/references?patch=16.2&queueId=420&mapId=11&championId=103&role=MIDDLE&definitionId=snapshot.totalGold&horizonKey=t:900000
GET /api/v1/references/definitions
```

O catálogo lista definições MET-19 de participantes, exceto rótulos. `snapshot.*` e `events.*` aceitam apenas os checkpoints 5/10/15/20 minutos (`t:300000`, `t:600000`, `t:900000`, `t:1200000`); descritivos finais exigem `final`. A unidade, versão e regra temporal acompanham a definição. Não se misturam o checkpoint legado versão 0, finais e preditores. Ouro, XP, CS e eventos continuam respeitando as regras temporais do [dataset histórico](DATASET-HISTORICO.md). Usar uma referência calculada depois de t como feature de um modelo exige seleção temporal de treinamento própria; este endpoint não declara tal uso livre de vazamento.

`patch` é exato em major.minor: 16.2 não inclui 16.20. `MID` normaliza para `MIDDLE`. `fromMs` inclui o instante inicial de criação; `toMs` exclui o instante final. Ambos são opcionais, mas período solicitado e extensão observada sempre aparecem na resposta. Não há pooling automático entre posição, campeão, fila, mapa ou horizonte. A API rejeita `usage`, `subjectKind`, `eligibleOnly` e `playerId`: controla esses eixos e exige `individualId` para identificar uma contribuição alvo do dataset dentro da mesma coorte. Alvo inexistente/fora dos filtros retorna 404. Parâmetros inválidos retornam 400. IDs de fila, mapa e campeão precisam caber no inteiro positivo Int32 do banco (até 2147483647).

Lê somente `HistoricalMetricContribution` da geração de processamento atual e versão atual do dataset/definição, mais os rosters persistidos de `MatchParticipant`. As três medidas V08 descritas abaixo também leem `finalStats`. Não consulta MatchRaw, Riot ou catálogo remoto durante GET. Uma transação Repeatable Read mantém as leituras coerentes. Esta entrega não altera schema, fórmula materializada ou geração 4: não requer migration/rebuild adicional. `processedAt` provém da contribuição publicada; conjunto ausente retorna `null`, nunca o relógio da consulta. IDs permitem recuperar evidência e linhagem na API/export MET-19. Rank observado na coleta não é rank à época da partida.

## Unidade, dependência e seleção

Uma linha é uma contribuição de um participante. Dez participantes da mesma partida não são dez partidas independentes. A seleção método 1:

1. Ordena por criação, matchId e ID da contribuição, nunca pelo valor da métrica.
2. Rejeita contribuições inelegíveis, valor ausente/não finito ou roster incompleto. Exige dez PUUIDs distintos, incluindo o sujeito.
3. Escolhe no máximo uma contribuição por partida. Havendo espelhos do mesmo campeão/posição, vence o menor ID entre os candidatos válidos da partida; não escolhe o melhor desempenho.
4. Rejeita qualquer partida que reutilize um dos dez jogadores de uma partida já selecionada. Quando existe alvo, exclui todo o roster do alvo antes da seleção, incluindo o próprio alvo e adversários/colegas que reapareçam.
5. Replay idêntico não soma evidência; identidades conflitantes são rejeitadas pelo helper puro.

`eligibleRows/Matches/Players` contam a coorte elegível antes da seleção. `validEligible*` separam ausência da métrica. `selectedRows/Matches/Subjects/RosterPlayers` descrevem exatamente o conjunto usado nas estatísticas. Os jogadores em `eligiblePlayers` são os sujeitos da métrica, enquanto `selectedRosterPlayers` inclui os dez jogadores de cada unidade selecionada. Nunca se usa N da seleção para qualificar estatísticas de outro conjunto. Excluídos têm contagens por motivo; IDs selecionados e fingerprint tornam a seleção auditável.

Rosters disjuntos removem reutilização direta, mas não provam independência residual nem representatividade. A seleção determinística pode favorecer partidas antigas e jogadores menos frequentes; horários, servidores, grupos e estratégias ainda podem gerar dependência. O estimando publicado é a distribuição da **subcoorte selecionada**, não da coorte inteira nem de todos os jogadores de alto elo. A exigência conservadora pode tornar a referência indisponível em históricos com jogadores recorrentes. O sistema mantém essa insuficiência visível.

## Precisão, distribuições e intervalos

Método estatístico 1: ECDF com empates agrupados, `F_n(x)=#{valor≤x}/n`. Quantis usam a inversa empírica tipo 1, `Q_n(p)=x_(ceil(np))` para p>0; p=0 retorna o mínimo. A mediana de N par é a observação central inferior, sem interpolação. Essa definição é explicitamente a modalidade tipo 1 documentada no [manual oficial de quantis do R](https://www.stat.ethz.ch/R-manual/R-patched/library/stats/html/quantile.html).

O percentil do alvo usa `100×(#{valor<alvo}+0,5×#{valor=alvo})/n`. Empates ocupam o ponto médio entre os limites esquerdo e direito da ECDF. A unidade é ponto percentual, não uma posição competitiva. Expressa posição numérica; um valor maior não significa necessariamente melhor desempenho (por exemplo, mortes). Valor zero observado participa normalmente. Alvo inelegível ou sem valor não recebe percentil. Roster desconhecido do alvo invalida a comparação, pois sua exclusão completa não pode ser conferida.

Para uma hipótese **condicional** de unidades i.i.d. de uma distribuição comum, a desigualdade DKW-Massart fornece `P(sup|F_n−F|>epsilon) ≤ 2 exp(−2n epsilon²)`. Consulte o teorema 6.13 do [capítulo de estatísticas de ordem de DasGupta, hospedado na CMU](https://www.cs.cmu.edu/afs/cs/academic/class/15750-s16/Handouts/orderstats.pdf). A coleção observacional e a seleção acima não estabelecem essa hipótese. Portanto os intervalos são bandas nominais sob hipótese, **sem garantia de cobertura populacional** para esta amostra de conveniência.

Parâmetros e fórmula publicados:

| Campo | Padrão | Validação e significado |
|---|---:|---|
| `confidence` | 0,95 | Entre 0,8 e 0,999; confiança nominal condicional |
| `cdfHalfWidth` | 0,15 | Entre 0,01 e 0,25; erro vertical em probabilidade da CDF, não erro relativo da métrica |
| `minimumUnits` | 0 | Inteiro 0…100000; piso adicional, nunca reduz o mínimo derivado |
| N requerido | 82 | `max(minimumUnits,ceil(log(2/(1−confidence))/(2×cdfHalfWidth²)))` |
| Erro alcançado | calculado | `min(1,sqrt(log(2/(1−confidence))/(2n)))`; ausente se n=0 |

Com os padrões, n≥82 controla nominalmente a largura vertical para até 15 pontos percentuais. Diminuir para 10 pontos exige 185 unidades; aumentar o piso pode exigir mais. É uma escolha explícita de precisão exploratória, não uma afirmação de que 82 partidas sejam representativas. O endpoint mostra os parâmetros, n observado, n requerido e a largura alcançada.

Cada ponto da ECDF acompanha `[max(0,F_n−epsilon),min(1,F_n+epsilon)]`. Quantis 0,1/0,25/0,5/0,75/0,9 acompanham a inversão `[Q_n(p−epsilon),Q_n(p+epsilon)]`. Se p−epsilon≤0 ou p+epsilon≥1, o limite respectivo é `null` com `lowerUnbounded`/`upperUnbounded=true`; não se substitui por mínimo/máximo observado com alegação de cobertura. A banda do percentil midrank aplica o mesmo epsilon ao ponto médio dos limites esquerdo e direito da CDF, convertendo para 0…100. Ela compartilha a mesma hipótese condicional.

Com amostra insuficiente, mediana/distribuição/quantis/percentil são `null`; a resposta conserva `individual` e até 50 observações individuais ordenadas, com valor ou motivo de ausência. Essas observações não se tornam unidades extras. `observations.total/returned/truncated` explicitam o limite da listagem. Acima de 10000 linhas candidatas, a consulta retorna `cohort_too_large`, total de candidatos, alvo se solicitado e contagens não calculadas `null`. Não calcula uma referência sobre truncamento silencioso; o consumidor deve restringir o período. Um `minimumUnits` superior à capacidade desta rota continuará explicitamente insuficiente.

Cobertura da métrica = linhas elegíveis com valor finito / linhas elegíveis. Denominador zero retorna `null`, não 0%. Motivos de ausência são separados dos motivos de exclusão da seleção. `unmaterializedMatches` conta partidas dos filtros comuns ainda sem qualquer contribuição do dataset atual; não mede lacunas de uma definição/horizonte dentro de partidas parcialmente materializadas. Não as presume elegíveis nem inventa uma contribuição. Intervalos de duração, mortes finais e outros denominadores internos permanecem na evidência original da definição.

## V08 — visão e investimento por posição

`final.visionScore`, `final.vision.placements` e `final.vision.removals` já são referências descritivas MET-19; as duas últimas contam eventos reconhecidos por MET-11. `events.wardsPlaced/Killed` nos checkpoints são contagens literais de eventos, incluindo tipos de ward desconhecidos; não são equivalentes a eventos reconhecidos ou compras.

Três definições de referência V08 versão 1 usam a contribuição `final.visionScore` como âncora de coorte/publicação, sem depender da disponibilidade de seu valor:

| Definição | Fonte `finalStats.values` / unidade | Ausência |
|---|---|---|
| `vision.controlWardsBought` | `visionWardsBoughtInGame`, contagem inteira | Campo ausente/inválido ou projeção diferente de 1 |
| `vision.controlWardsPlaced` | `detectorWardsPlaced`, contagem inteira | Independente da contagem de compras e visionScore |
| `vision.controlWardGoldSpent` | Ouro efetivamente gasto, ainda indisponível | `missing_validated_purchase_context` ou `unsupported_cost_catalog` |

A evidência revisada para patch interno 16.2/mapa 11 é Data Dragon 16.2.1, item 2055 comprável e preço de catálogo 75, consultada em 2026-09-23. Trata-se de preço de tabela, não de gasto observado. [Catálogo oficial versionado](https://ddragon.leagueoflegends.com/cdn/16.2.1/data/en_US/item.json).

As notas públicas 26.1 documentam que concluir a missão de suporte reduz esse preço para 40. Isso demonstra por que a multiplicação ingênua não basta: faltam regra validada no patch exato, elegibilidade/estado da missão em cada compra e contabilidade de compra/desfazer. O rótulo público 26.1 não é convertido automaticamente em `gameVersion` interno 16.1. Posição final e inventário final não demonstram o estado no momento da compra. [Notas oficiais da Riot, patch 26.1](https://www.leagueoflegends.com/en-sg/news/game-updates/patch-26-1-notes/).

Consequentemente, esta versão informa as contagens observadas e a evidência de catálogo/regra, mas mantém gasto em ouro ausente, inclusive quando a contagem é zero. Não multiplica compras ou placements por 75/40, não usa `goldEarned−goldSpent`, não chama saldo de desperdício e não interpreta posição do jogador como posição da ward. Para outros patches/mapas, a evidência de catálogo é `null`. Nenhuma constante é usada como fallback de preço atual.

## Reutilização e validação

`src/modules/references/domain/` exporta as políticas de precisão, seleção de
coorte e estatística; `src/lib/math/` contém a matemática empírica genérica.
As funções puras recebem valores/rosters explícitos. Os contratos e o
`ReferenceService` expõem a consulta de coorte para MET-21/26–32. O adapter
Prisma de references aplica os filtros públicos de dataset com a mesma
semântica de versão, elegibilidade e período; não importa o
repositório/adaptador de dataset nem cria filtros concorrentes.

[Exemplos reproduzíveis](analysis/met20-examples.json) são fragmentos identificados: uma partida real da fixture 16.2/420/11 retorna insuficiência; 83 partidas, valores e rosters inteiramente sintéticos demonstram o caso nominal suficiente após excluir o alvo. Estes dados controlados não ampliam a cobertura real do corpus. Metadados de processamento/descoberta da fixture também são sintéticos, explicitamente datados. Reproduza com `npx ts-node --transpile-only scripts/example-references.ts`.

A validação inclui casos puros de empates, zero/ausência, largura nominal, caudas não identificadas, filtro de contexto, rosters repetidos, exclusão completa do alvo e limite de consulta; HTTP com ValidationPipe/OpenAPI; PostgreSQL real com 85 partidas sintéticas (83 na coorte, uma posição diferente e um patch 16.20), múltiplos GETs idênticos e fontes ausentes. Os testes PG usam banco local isolado, período sintético em 2040 explicitamente separado de outras fixtures (com asserção de ausência antes de semear) e nenhum raw. Resultados dos gates ficam no [registro de validação](analysis/met20-validation.json).
