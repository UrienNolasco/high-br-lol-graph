# MET-23 — popularidade e tier de campeões (H07)

As rotas `GET /api/v1/stats/champions?patch=16.2&queueId=420` e
`GET /api/v1/stats/champions/266?patch=16.2&queueId=420` usam a mesma população,
fórmula e ranking. O detalhe também aceita a chave do catálogo, como `Aatrox`;
IDs numéricos permitem consultar campeões sem catálogo. Paginação e ordenação
não alteram denominadores. Valores ausentes ficam no final de ambas as ordens;
empates usam o ID do campeão.

## População, fonte e fórmulas

`metricId=H07`, `metricVersion=1`. Fontes persistidas: `Match`,
`MatchParticipant`, `MatchTeam`. A consulta agrega projeções em SQL, sem abrir
`MatchRaw` e sem usar os antigos campos incrementais `ChampionStats.pickRate`
e `ChampionStats.banRate`. A unidade de análise é uma partida distinta pelo
`matchId`; dez participantes não são dez partidas.

Filtros: patch interno `major.minor` exato (versão igual ao patch ou começando
por `patch + '.'`), mapa 11 e uma única fila, 420 por padrão ou 440 explicitamente.
`16.2` não inclui `16.20`. Janela: todas as partidas armazenadas desses filtros,
sem corte temporal adicional. O resultado descreve a amostra coletada; não é
uma estimativa de toda a população regional, nem ajusta por posição ou jogador.

Elegibilidade exige `populationEligible=true`, preenchido no processamento
pela regra de remake do MET-01. A única regra validada no corpus real é 16.2:
duração positiva e dez flags `gameEndedInEarlySurrender=false`. Flag positiva,
ausente, inválida ou incompleta produz `unknown_remake`; versão sem regra
produz `unsupported_version`. Rendição comum não significa remake. A regra não
afirma identificar positivamente todos os remakes. Partidas antigas com campo
nulo são excluídas como `missing_eligibility_projection`, até rebuild.

Seja N o número de partidas elegíveis:

| Campo | Fórmula / significado |
| --- | --- |
| `pickRate` | `100 × partidas distintas que escolheram o campeão / N`, percentual |
| `banRate` | `100 × partidas distintas que baniram o campeão / N`, percentual; exige bans completos nas N partidas |
| `gamesPlayed`, `pickedMatches` | Contagem de partidas distintas com escolha, não participantes |
| `bannedMatches` | Contagem observada de partidas distintas com ban positivo, mesmo com cobertura incompleta |
| `performanceN` | Partidas elegíveis com exatamente um participante usando esse campeão |
| `winRate` | `100 × wins / performanceN`, percentual |
| `wins`, `losses` | Contagens nas `performanceN` partidas |
| `kda` | Média do KDA final projetado: `(kills + assists) / max(deaths, 1)` por partida |
| `dpm`, `gpm`, `cspm` | Média de dano final a campeões, ouro ganho ou CS total divididos pela duração de cada partida em minutos |

Bans duplicados dentro do time ou entre os dois times contam uma vez por
partida. IDs 0 e -1 significam nenhuma escolha de ban e não criam campeões.
Um array vazio de bans é observado e válido. Array ausente, não-array ou com
entradas inválidas gera `bansAvailable=false`. Uma partida só tem bans completos
quando há dois times com `bansAvailable=true`. Com qualquer partida elegível de
bans desconhecidos, `banRate=null` para toda a coorte; não se troca o denominador
pelo subconjunto conhecido. `bannedMatches` continua sendo evidência parcial.

Escolhas duplicadas do mesmo campeão contam uma vez para popularidade, mas
ficam fora de desempenho porque a vitória desse campeão é ambígua. São
visíveis pela diferença `pickedMatches - performanceN`. Sem desempenho,
`wins`, `losses`, `winRate`, `kda`, `dpm`, `gpm`, `cspm` são nulos. O motivo é
`no_picks` para campeão somente banido e `ambiguous_selection` quando todas
as escolhas são duplicadas. Zero continua sendo um resultado válido quando
observado. Se N=0, a lista fica vazia e a cobertura explica as exclusões.

O conjunto retornado é a união de IDs escolhidos e banidos nas partidas
elegíveis. Um campeão somente banido aparece com `gamesPlayed=0`, `pickRate=0`
e desempenho nulo. Catálogo desconhecido nunca remove uma linha. Nome e
imagens do catálogo só são usados quando a versão interna coincide com o
patch pedido; caso contrário preserva-se o nome observado na partida, se
houver, e `images=null`, `availability.catalog=missing_catalog`. Não se
substitui silenciosamente um catálogo histórico pelo catálogo atual.

## Cobertura e compatibilidade da API

Cada campeão inclui `population` com filtros, `eligibleN`, `selectedN`,
`excludedN`, `excludedReasons`, `pickedMatches`, `bannedMatches`,
`bansObservedN`, `performanceN` e `banCoverage` (fração 0–1 ou nulo).
A raiz paginada inclui `cohort`, inclusive para resultado vazio.
`availability` explica ausência de desempenho, bans, picks, catálogo e tier.
Exemplos executáveis gerados das funções da aplicação estão em
[analysis/met23-api-examples.json](analysis/met23-api-examples.json).

As rotas e os nomes dos campos legados permanecem. A mudança semântica é
intencional: taxas corrigidas, nome/desempenho nulos quando desconhecidos,
mais campeões somente banidos e metadados adicionais. Consumidores devem
aceitar nulabilidade conforme OpenAPI. `rank=null` e `score=null` significam
que não há classificação suficiente, não uma posição ou força igual a zero.

## Tier: heurística explícita, versão 2

Não é medida de confiança estatística, efeito causal ou força universal do
campeão. Os pesos são convenções herdadas e agora expostas em `tierMethod`.
São necessários todos os sete insumos finitos não negativos e pelo menos
50 partidas de desempenho. Caso contrário: `Dados Insuficientes`, `score=null`,
`rank=null`, motivo `missing_metric` ou `insufficient_sample`.

Cada insumo abaixo é limitado ao intervalo 0–100 antes da soma:

| Insumo normalizado | Peso |
| --- | --- |
| `(winRate - 45) × 10` | 0,35 |
| `banRate × 10` | 0,25 |
| `pickRate` | 0,15 |
| `kda / 3 × 100` | 0,10 |
| `dpm / 1200 × 100` | 0,08 |
| `gpm / 600 × 100` | 0,04 |
| `cspm / 8,5 × 100` | 0,03 |

A soma é multiplicada por 0,90 (N=50–99), 0,94 (100–199), 0,97 (200–499)
ou 1,00 (500+). Aqui N é `performanceN`, não o denominador de popularidade.

O patch anterior é o predecessor numérico entre versões **observadas** em
`Match`, na mesma fila e mapa. Ambos os patches precisam existir; sem
predecessor, retorna nulo. Não se presume quantidade de patches por ano,
não se subtrai um e não se preenche com zero à esquerda. O predecessor pode
não ter dados elegíveis, caso em que não participa do cálculo. Somente quando
o mesmo campeão no predecessor tem todos os insumos e pelo menos 50 partidas
de desempenho, combina-se `0,7 × atual + 0,3 × anterior`; somam-se 5 pontos se
as diferenças de win rate e ban rate forem respectivamente >2 e >1 ponto
percentual, ou subtraem-se 5 quando forem <-2 e <-1. `previousPatch` indica o
candidato observado; a condição de aplicação está em `tierMethod.patchBlend`.

Limiares: S+ exige score ≥80, WR >51 e BR >5; S ≥70; A ≥55; B ≥40; C ≥30;
demais D. O rank ordena scores suficientes na coorte inteira, com desempate
por ID. Não é rank por posição. Os valores são enviados sem arredondamento
intermediário; apresentação pode arredondar sem modificar o cálculo.

## Persistência e rebuild

A migration `20260923150000_met23_champion_population` adiciona campos
nuláveis de elegibilidade e disponibilidade de bans e um índice de
fila/mapa/versão, preservando registros existentes como desconhecidos.
`PROCESSING_VERSION=3` exige reconstruir as projeções antigas a partir do raw
usando o fluxo offline existente, após pausar os escritores. Não há backfill
que deduza disponibilidade de bans a partir de um array já normalizado, pois
um array vazio legado pode representar ausência de dados.

O parser escreve os novos campos na mesma transação de partida, times,
participantes e conclusão do processamento. A popularidade é recalculada das
linhas únicas publicadas; não há incremento separado de taxas que possa
duplicar contribuições numa entrega repetida. O teste de processamento compara
também a população antes e após dois rebuilds, recuperação e retry.

## Evidências de validação

Testes unitários verificam flags/versões suportadas, disponibilidade de bans,
heurística calculada à mão, limiares, patch anterior observado, catálogo
incompatível, denominador vazio, ordenação de nulos e mesmo detalhe/lista.
Testes HTTP verificam JSON, filtros inválidos e OpenAPI. A suíte SQL usa
variações sintéticas rotuladas do fixture real, isoladas pelo patch artificial
99.23: escolhas e bans duplicados, campeão somente banido, exclusões, bans
ausentes, fila/mapa/patch diferentes e população vazia. A elegibilidade desses
fixtures SQL é definida explicitamente; isso não valida a regra de remake
para 99.23. A validação real permanece limitada a 16.2.

Validação local de 23/09/2026: build, 58 suítes/271 testes unitários,
17 testes HTTP e 4 suítes/31 testes de integração passaram. A migration foi
aplicada no PostgreSQL isolado de integração; a segunda execução informou
nenhuma migration pendente. Os testes de integração incluem processamento
repetido, falha transacional, dois rebuilds e comparação da população.
Nenhuma consulta ou alteração de produção foi feita. Para regenerar os
exemplos após o build: `node scripts/build-champion-popularity-examples.cjs`.
