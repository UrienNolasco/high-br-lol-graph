# MET-25 — presença amostrada em regiões geométricas (B08)

`GET /api/v1/matches/:matchId/map-presence/:puuid` descreve a distribuição das
posições **observadas do jogador** por região e fase. Não entrega duração de
permanência, trajetória contínua, localização de wards ou classificação oficial
de lane/jungle. Partida ou participante ausente retorna 404; dados indisponíveis
retornam 200 com motivo, cobertura e valores nulos.

## Definição experimental e limites de validação

A definição `experimental-sr-grid`, versão 1, é uma grade de nove polígonos
retangulares no domínio escolhido `[0,15000] × [0,15000]`, mapa 11. Esse domínio
foi escolhido para esta análise: **não é um limite oficial do mapa comprovado**.
Os nomes são direções geométricas no plano, não lanes, bases, brushes, jungle,
zonas caminháveis ou territórios de cada time.

Suporte inicial: patch interno 16.2. O fixture real `BR1_3200579475` tem 41
frames e 410 posições: x observado de 130 a 14.589; y de 135 a 14.673. Todas
essas posições cabem no domínio. Isso valida a cobertura das coordenadas deste
fixture e a reconciliação das contagens; **não valida semanticamente as regiões**,
o domínio de todas as partidas nem outros patches/mapas. Patches 16.20, mapas
diferentes e definições ausentes retornam `unsupported_map_definition`.

O código contém os vértices e valida versão, IDs únicos, domínio finito, vértices
dentro do domínio e área não nula. A grade fixa tem nove interiores distintos.
Essa verificação estrutural não demonstra correspondência a áreas oficiais do
jogo. Ampliar suporte exige evidência, revisão da definição e versionamento.

| y / x efetivo após desempate | [0,5000] | (5000,10000] | (10000,15000] |
| --- | --- | --- | --- |
| (10000,15000] | northwest | north | northeast |
| (5000,10000] | west | center | east |
| [0,5000] | southwest | south | southeast |

Cada polígono tem bordas fechadas. A classificação usa teste ponto-no-polígono
com ray casting e reconhecimento explícito dos segmentos. Em bordas ou vértices
compartilhados, ganha o primeiro polígono na ordem declarada: linhas de sul a
norte, colunas de oeste a leste. Por exemplo, (5000,5000) pertence a southwest;
(5000,7500), a west; (15000,15000), a northeast. Não há tolerância espacial
oculta, arredondamento ou deslocamento da posição. Zero é uma coordenada válida.

`absolute` usa a geometria original. `teamRelative` mantém o índice da célula
para time 100 e gira esse índice em 180° para time 200: `(col,row) → (2-col,2-row)`.
A classificação e o desempate de borda ocorrem **antes** da orientação. As
coordenadas fonte nunca são alteradas. Assim o canto de referência southwest
se alinha à perspectiva do outro lado, sem afirmar que toda a célula é sua base.
Time desconhecido preserva a distribuição absoluta e retorna distribuição
orientada nula, `teamRelativeReason=unsupported_team`.

## Fórmula, denominador e fases

Unidade de análise: uma posição do participante em um frame identificado pelo
`frameIndex`. Não é segundo, minuto, evento de movimento ou colocação de ward.
O endpoint é descritivo de uma partida/participante, filtrado por mapa e versão
suportados; não constrói coorte por elo, posição, fila, vitória ou remake.

Uma amostra válida exige timestamp finito não negativo dentro da duração,
exatamente um snapshot associado ao PUUID, x/y finitos e posição dentro do
domínio da definição. Para cada região:

`fraction = sampleCount na região / número de amostras de posição válidas na fase`

`fraction` é fração 0–1, origem `derived`; `sampleCount` e `frameIndices` fornecem
o numerador e sua evidência. Todas as regiões aparecem, inclusive contagem zero.
Com N válido zero, fração nula e `zero_denominator`; não se usa o total de frames
como denominador nem se assume presença zero. Com N > 0, as frações das nove
regiões somam 1 (sujeito à precisão de ponto flutuante).

Fases convencionais, sem alegar transições objetivas de estilo de jogo:

- early: `[0,600000)` ms;
- middle: `[600000,1200000)` ms;
- late: `[1200000,fim]` ms.

O fim observado usa `GAME_END` do MET-03. Sem esse evento, `observedEndMs=null`,
`effectiveEndMs=Match.gameDuration×1000` e a origem do limite é explícita.
Partidas curtas censuram as fases: a fase interrompida inclui o último frame;
fases não iniciadas ficam sem amostras. Um timestamp exatamente em 10 ou 20 min
pertence à fase que começa ali, inclusive quando também é o fim do jogo. Nesse
caso, uma janela observada de duração zero pode conter uma amostra de borda:
o denominador continua sendo observações, nunca duração.

## Cobertura e ausência

`samples` mantém a identidade dos frames, timestamp, posição finita quando
disponível, região absoluta/orientada e motivo. Posição fora do domínio é
preservada como evidência da exclusão e não forçada à célula mais próxima.
Coordenadas ausentes ou inválidas ficam nulas, sem interpolação ou forward fill.

`quality.validSamples/totalSamples/coverage` e `excludedReasons` existem na
raiz e por fase. Motivos incluem `missing_position`, `invalid_position`,
`outside_definition_domain`, `missing_participant_frame`,
`ambiguous_participant_frame`, `missing_timestamp` e
`outside_observed_duration`. Frames sem timestamp não podem ser atribuídos a
uma fase: permanecem na cobertura global e em `evidence.unassignedTimestampN`.
Frames após o fim ficam em `outsideDurationN`. A soma dos Ns das fases pode
ser menor que o N global total por essas exclusões, nunca por descarte silencioso.

## Frequência observada, sem duração de ocupação

`sampling.declaredFrameIntervalMs` preserva o intervalo nominal do envelope.
`sampling.frames` descreve todos os timestamps válidos; `sampling.validPositions`
descreve somente as posições válidas. Cada fase informa sua cadência válida.
Cada intervalo fornece os dois índices, os dois timestamps e `elapsedMs` real.
Mínimo, máximo e mediana usam apenas intervalos positivos; intervalos zero têm
contagem própria. `frequencyHz` é `(timestamps distintos − 1) / span observado
em segundos`; sem span positivo, é nula.

Frames distintos com timestamp igual são preservados e contam como amostras
distintas; `uniqueTimestampN` e `zeroIntervalN` tornam essa duplicidade visível.
Não são assumidas observações independentes. O fixture tem dois frames finais
no mesmo minuto, separados por 28.157 ms: esse intervalo permanece exato e
não é substituído pelo nominal de 60.000 ms.

Todas as posições válidas recebem o mesmo peso, apesar de intervalos diferentes.
A fração **não é fração do tempo**, e não se multiplica a fração pela duração
para estimar segundos na região. Não se liga um frame ao próximo como rota
contínua; nada é inferido entre observações.

## Proveniência, leitura e wards

`metricId=B08`, `metricVersion=1`; a versão da definição é independente.
`processedAt` e `processingVersion` vêm do registro `MatchProcessing` concluído,
lido com a projeção numa transação `RepeatableRead`. Geração anterior a 2 é
`unsupported_version`; data/status/versão ausentes resultam em
`missing_processing_provenance`. Não se inventa data no GET. Nesses estados,
nenhuma posição contribui para frações ou frequência calculada. Sem projeção
suportada, `missing_projection`; os arrays legados não são substitutos.

O serviço seleciona apenas contexto, PUUID/time e `MatchTimelineProjection`.
Não lê raw, eventos, catálogo, `wardPositions` ou APIs externas. Uma ward sem
coordenadas próprias continua nula no parser existente. O teste que exercita
o parser e o cálculo confirma isso mesmo quando o jogador tem posição no frame. Evidência
do endpoint declara `subjectKind=player` e `wardPositionsUsed=false`.

Não há alteração persistida, migration nem nova geração de processamento nesta
tarefa. Projeções antigas ausentes requerem o rebuild offline existente; não
há recomputação com efeitos de escrita no GET.

## Evidências e exemplos

Testes puros conferem as 410 posições por faixas de coordenadas calculadas
independentemente, as nove regiões, soma de denominadores por fase, bordas,
rotação, ausência, coordenada zero, domínio, timestamp igual, partida curta,
versão não suportada e separação jogador/ward. HTTP verifica nulabilidade,
OpenAPI, 404 e seleção das projeções. PostgreSQL verifica coordenada nula
persistida, timestamps e data do processamento, sem raw e com leitura repetida
idêntica.

[analysis/met25-presence-examples.json](analysis/met25-presence-examples.json)
contém exemplo gerado das funções puras e uma variação sintética rotulada.
O horário de processamento do exemplo é um dado controlado de teste, não
proveniência real de produção. Regeneração offline após o build:
`node scripts/build-map-presence-examples.cjs`.

Validação de 23/09/2026: build e lint passaram; 71 suítes/352 testes unitários
passaram. O coordenador executou os gates de rede local: HTTP 4/4 (6,038 s)
e PostgreSQL isolado 1/1 (3,703 s), sem migrations ou acesso à produção.
O exemplo completo do participante tem 44.241 bytes em JSON sem compressão,
41 amostras válidas e Ns por fase 10/10/21. Esse tamanho é medição offline
do fixture, não benchmark de latência nem evidência de cobertura multiversão.
