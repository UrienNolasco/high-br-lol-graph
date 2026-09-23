# MET-12 — economia e progressão por observações temporais

`GET /api/v1/matches/:matchId/economy/:puuid?mode=nearest` entrega as
oportunidades E01/E02/E03/E04/E05/E07/E10 para um participante. `mode=pastOnly`
seleciona somente observações anteriores ou iguais ao alvo. Partida ou jogador
inexistente retorna 404; modo inválido retorna 400. O GET lê somente projeções
locais: `MatchTimelineProjection`, contexto/participantes de `Match` e
`MatchProcessing`. Não consulta Riot, catálogo, raw ou arrays legados.

## Contrato e população

O envelope raiz carrega `matchId`, `puuid`, `metricVersion=1`,
`processingVersion` e `processedAt` do processamento concluído. Esses campos
valem para todas as células do relatório. Cada célula tem `metricId`, valor,
unidade, origem (`observed`, `derived`, `unavailable`), motivo, método,
denominador, qualidade e evidência com frame/timestamp/campo. Valor ausente é
nulo e inclui motivo; zero só representa observação válida.

`processedAt` é exatamente `MatchProcessing.completedAt`, nunca o horário do
GET. A leitura de partida e proveniência usa uma transação `RepeatableRead`.
Se não há processamento concluído com versão/data, o relatório retorna
`reason=missing_processing_provenance`, data/versão nulas, sem amostras ou
curvas calculadas, e checkpoints indisponíveis. Projeção ausente ou não
suportada retorna `missing_projection`; não reconstrói dados no GET.
Processamento anterior à geração 2 retorna `unsupported_version`, mesmo se
houver um registro com formato semelhante à projeção nova; mantém a data e
versão antigas como evidência, mas não publica métricas calculadas.

A coorte aceita mapa 11 e filas 420/440, com a regra conservadora de remake
do MET-01: somente 16.2 possui evidência real, exigindo duração positiva e dez
flags finais `gameEndedInEarlySurrender=false`. Ausência ou flag positiva é
`unknown_remake`; outro patch é `unsupported_version`. Rendição comum não é
usada como sinônimo de remake. A elegibilidade e o motivo são expostos na
raiz e em cada checkpoint; isso descreve as condições de observação, sem
atribuir desempenho causal ao participante.

## Checkpoints e adversário

Alvos: 300.000, 600.000, 900.000 e 1.200.000 ms (5/10/15/20 minutos).
Cada checkpoint informa `targetMs`, `actualMs`, `offsetMs=actual-target`,
`frameIndex`, `mode`, tolerância de 60.000 ms, `eligible` e
`comparisonEligible` com motivos separados.

`nearest` escolhe a observação mais próxima dentro da tolerância, inclusive
posterior ao alvo, para descrição retrospectiva. `pastOnly` proíbe frames
posteriores, adequado quando a análise precisa evitar informação futura.
Empates escolhem timestamp anterior e depois menor índice do frame. Partida
encerrada antes do alvo retorna `short_match`, mesmo havendo frame próximo.
Sem frame na tolerância retorna `missing_frame`. O frame é escolhido uma vez;
participante ausente nesse frame não é substituído por outra observação.

Fim da partida: `observedEndMs` é o timestamp `GAME_END` preservado pelo MET-03,
inclusive os milissegundos além do segundo inteiro. Quando ausente, fica nulo;
`effectiveEndMs` usa `Match.gameDuration × 1000` e
`endSource=Match.gameDuration_seconds` torna explícita essa limitação de
precisão. Frames posteriores ao limite não entram nos intervalos ou sumários.

O adversário exige posição canônica única nos dois times (MID é normalizado
para MIDDLE). Posição ambígua ou adversário ausente gera diferenças nulas,
sem escolher um jogador arbitrário. As observações individuais permanecem
disponíveis: role não altera o ouro literalmente observado. Comparações usam
o mesmo frame para ambos. `values`, `opponent` e `differences` apresentam
campos separados; diferença é participante menos adversário e pode ser negativa.

## Valores e fórmulas

| Campo | Fonte / fórmula | Unidade e oportunidade |
| --- | --- | --- |
| `totalGold` | `participantFrames.totalGold` | ouro, E01 |
| `xp` | `participantFrames.xp` | XP, E01 |
| `level` | `participantFrames.level` sem teto artificial | nível, E07 |
| `laneCs` | `participantFrames.minionsKilled` | CS, E02 |
| `jungleCs` | `participantFrames.jungleMinionsKilled` | CS, E02 |
| `totalCs` | laneCs + jungleCs; nulo se faltar componente | CS, E01 |
| `currentGold` | `participantFrames.currentGold` literal | ouro, E05 |
| `goldShare`, `csShare` | recurso individual / soma dos cinco aliados no mesmo frame | fração 0–1, E04 |

Shares exigem cinco aliados distintos com campos válidos; não somam apenas
quem estiver disponível. Total zero produz `zero_denominator`; total
incompleto, `missing_team_sample`. A qualidade informa quantos aliados têm
dados. Distribuição descreve participação nos recursos, sem juízo de justiça.

`samples` preserva todos os frames com identidade e timestamps, ordenados por
tempo/índice; timestamps iguais não são colapsados. Campos individuais faltantes
não viram perda, saldo zero ou dado do resumo final. Frames sem timestamp são
mantidos como indisponíveis e excluídos dos cálculos temporais.

`intervals` compara observações adjacentes de totalGold, XP e CS lane/jungle/total:

- ganho = contador final − contador inicial;
- taxa por minuto = ganho / ((timestamp final − timestamp inicial) / 60.000).

Tempo e índices dos dois frames estão na resposta; o denominador é o tempo
real transcorrido, inclusive o último intervalo parcial. Tempo igual ou
negativo não produz taxa (`zero_denominator`). Contador cumulativo regressivo
fica indisponível (`counter_regression`); campo ausente em qualquer ponta
mantém ganho/taxa nulos. Um intervalo longo significa somente mudança entre
as duas observações, sem inventar a trajetória intermediária. `currentGold`
é saldo amostrado e não entra nos ganhos de renda.

`phases` usa as fronteiras 0/5/10/15/20/fim, interrompendo na duração da partida.
Cada ponta é escolhida pelo mesmo modo/tolerância; a resposta distingue
fronteiras alvo, offsets e tempo efetivo. Não interpola valores entre frames.
A fase final pode começar antes de 20 min em partidas curtas. Um frame usado
nas duas pontas gera taxa indisponível. Fases contam diferenças dos contadores,
não somas de taxas arredondadas.

## Ouro não gasto e recursos finais

`unspentGold` apresenta máximo, mediana e fração das amostras válidas com
`currentGold >= 1000`, com N válido/N total e evidências. Mediana e fração
atribuem peso igual a cada observação, **não ao tempo**. Duas observações no
mesmo minuto continuam distintas; a fração não é percentual do tempo de jogo.
O limiar é descritivo e está na resposta. Não é recomendação de compra.
Não se calcula `goldEarned − goldSpent`, nem se chama esse saldo de desperdício.

`finalResources` expõe literalmente `totalMinionsKilled`,
`neutralMinionsKilled`, `totalAllyJungleMinionsKilled` e
`totalEnemyJungleMinionsKilled` de `MatchParticipant.finalStats.values`.
São totais finais com fontes próprias; não substituem amostras faltantes e
não revelam a rota pelos campos da jungle. A divisão aliado/adversário é E10.

## Compatibilidade e validação

O contrato novo é versão 1. O agregado legado @15 permanece versão 0, com
`first_in_window [900000,960000)`; nenhuma rota existente foi alterada e
esses agregados não entram no cálculo novo. Não há nova projeção persistida
nem migration nesta tarefa: utiliza versões 1 das projeções MET-03/MET-05,
cuja reconstrução foi validada no MET-09. Dados antigos sem projeção/proveniência
requerem o rebuild offline existente antes de se tornarem disponíveis.

Testes conferem os 40 checkpoints dos dez participantes do fixture real,
contra seleção independente dos frames fonte; o último intervalo real vai de
2.340.765 a 2.368.922 ms (28.157 ms). Variações sintéticas controladas verificam
partida curta, tolerância, modos, campos/participante ausentes, posição ambígua,
empates de timestamp, regressão de contador, denominador zero e cobertura do
time. O fixture real é somente do patch 16.2; variações não ampliam a matriz
de suporte. O teste de integração verifica round-trip dos timestamps e da
data de processamento, leitura repetida idêntica e ausência de raw.

OpenAPI documenta células nulas, checkpoints, intervalos e fases. Exemplos
recortados de respostas reais da função pura estão em
[analysis/met12-economy-examples.json](analysis/met12-economy-examples.json),
com proveniência de teste explicitamente rotulada. Regeneração offline após
build: `node scripts/build-economy-examples.cjs`.

Medição offline do fixture: resposta completa de um participante com 41 frames
tem 651.336 bytes em JSON sem compressão, incluindo evidências repetidas nas
células. O artefato de exemplo contém recortes e registra esse tamanho. Não é
benchmark de latência; MET-17/MET-33 devem considerar o custo ao compor o
relatório completo ou selecionar seções para apresentação.

Validação em 23/09/2026: build, 63 suítes/323 testes unitários e 4 testes HTTP
passaram. O coordenador executou o teste PostgreSQL isolado após reservar o
banco: 1/1 passou em 5,867 s. Esse teste cobre ida e volta das projeções,
timestamp final parcial, data real persistida, repetição idêntica e
`completedAt=null`. Não houve migration, rebuild adicional ou acesso à produção.
Após a revisão, o bloqueio de geração 1 foi coberto por um teste novo; os 16
testes focados de cálculo/serviço, build e lint passaram novamente.
