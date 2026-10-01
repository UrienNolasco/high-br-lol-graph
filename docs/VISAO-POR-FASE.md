# Visão por tipo, fase e janela — MET-11

`GET /api/v1/matches/:matchId/vision/:puuid` publica V01–V07 para um participante, usando somente MatchEventProjection, MatchParticipant.finalStats e a proveniência de MatchProcessing. Não consulta Riot, Data Dragon ou MatchRaw. Partida/jogador ausente retorna404; projeção incompleta preserva motivo de ausência e os campos finais que continuam disponíveis. A rota é aditiva e não modifica as rotas legadas de posições.

`calculateVision` é uma função pura reutilizável pelo relatório MET-17. `metricVersion=1` identifica as definições abaixo. Eventos compatíveis têm versão1 e a mesma processingVersion do job COMPLETED, geração>=2. Sem completedAt não se inventa data de processamento: metrics=null, reason=not_calculated e processedAt=null. Com proveniência, cada escalar usa MetricResult, com fonte, evidência, unidade, janela, denominador, versão, origem e razão para null.

## Categorias e reconciliação

Tipos reconhecidos pela definição1: SIGHT_WARD, YELLOW_TRINKET, BLUE_TRINKET e CONTROL_WARD. Qualquer outro tipo, inclusive UNDEFINED, MISSING e nomes futuros, permanece na categoria UNKNOWN com o nome original e a identidade `(matchId, frameIndex, eventIndex)`. Não há deduplicação por timestamp: eventos simultâneos distintos contam separadamente. Repetição da mesma identidade no argumento da função é contada uma vez e informada na cobertura.

V01/V02 contam eventos WARD_PLACED/WARD_KILL atribuídos a um PUUID existente, separando reconhecidos, desconhecidos e control wards. As contagens de tipo não alegam presença/duração de uma ward no mapa. A ausência de coordenadas não é preenchida pela posição do jogador: a evidência desta rota publica position=null e spatialInterpretation=global_event_activity_only. Tipos desconhecidos não viram zero reconhecido por descarte silencioso; sua contagem aparece ao lado.

V03 mantém campos finais separados: visionWardsBoughtInGame (compras), detectorWardsPlaced (resumo de control wards colocadas), wardsPlaced, wardsKilled e visionScore (pontos). Não substituir compra por colocação, nem recalcular o score a partir da timeline. Campo final ausente/inválido fica null; zero observado continua0. O contrato informa divergências `recognized events - summary total`, sem sobrescrever qualquer fonte. Divergências podem depender de regra do patch/tipo desconhecido; a reconciliação não é prova geral da semântica de outros patches.

V04 `placementShare = recognized player placements / recognized team placements *100`, em porcentagem. O denominador inclui somente colocações reconhecidas atribuídas ao time; zero retorna zero_denominator. Não inclui eventos desconhecidos como colocações reconhecidas nem soma os dois grupos para imitar o total do resumo. A resposta também expõe removalShare com o denominador de remoções reconhecidas e visionScoreShare com a soma final dos cinco participantes do time, indisponível se faltar campo ou integrante. Não há score universal ou juízo sobre posicionamento.

Na fixture real BR1_3200579475 (patch interno16.2, fila420, mapa11), os dez participantes reconciliam 196 colocações reconhecidas, 556 desconhecidas e51 remoções. Zilean tem2 compras de control ward,1 colocação e visionScore110; essas medidas permanecem distintas. [Reconciliação reproduzível](analysis/met11-vision-reconciliation.json) e [trecho de resposta](analysis/met11-vision-example.json). Não há amostras reais adicionais de outros patches nesta validação.

## Tempo, fases e lacunas

A janela integral vai de0 ao timestamp de GAME_END observado, incluindo as duas bordas. Isso preserva o final parcial da timeline em ms, que pode diferir da duração arredondada do resumo. Sem GAME_END, a duração do resumo serve apenas para descrever a janela pretendida: contagens temporais ficam indisponíveis. Timestamp ausente/fora do intervalo, ator não resolvido ou geração incompatível torna a contagem completa indisponível; eventos recebidos continuam listados como evidência parcial. coverage distingue eventos fonte, com timestamp válido, atribuídos e desconhecidos. A qualidade dos escalares temporais descreve essa cobertura da partida inteira, não uma imputação dentro da janela.

V07 usa fases descritivas versionadas `[0,14min)`, `[14,25min)`, `[25min,GAME_END]`, cortadas pelo fim observado. Não afirma que regras de placas ou fases competitivas mudem universalmente nesses instantes. Cada fase contém os mesmos grupos de contagem e a diferença de colocações e de remoções reconhecidas do time do participante menos as dos outros times, com evidências e sujeito de time.

V05 também publica recognizedPlacementsPerMinute = colocações reconhecidas / (GAME_END em ms /60000), em contagens/minuto; janela nula retorna zero_denominator.

V05 retorna duas políticas de maior intervalo **entre colocações reconhecidas do participante**, em segundos: somente pares internos; e pares incluindo início0/fim de jogo. Empates escolhem o menor início. Com menos de duas colocações, a política interna fica insufficient_sample; sem nenhuma colocação reconhecida, a política com bordas mede a janela inteira. Eventos desconhecidos são informados e não autorizam dizer que o jogador ficou sem colocar qualquer ward. Os extremos referenciam IDs reais ou null para borda do jogo; a métrica fica null se a cobertura não permite concluir o maior intervalo.

## Janelas anteriores a capturas

V06 retorna duas janelas para cada ELITE_MONSTER_KILL observado:60s e90s. `requestedStartMs=objective.timestamp-lookback`; janela efetiva `[max(0,requestedStart),objective.timestamp)` exclui eventos exatamente no instante da captura. Se a janela atravessa o início do jogo, censored=true. Capturas posteriores ao fim observado não entram. A evidência liga objectiveEventId, eventIds, grupos do jogador e dos dois times; o time beneficiário vem do evento normalizado e pode ser null.

A atividade é **global**. Sem coordenadas de colocação, não é possível afirmar que as wards cobriram rio, pit ou aproximação do objetivo. Janelas de capturas próximas podem compartilhar um evento; seus totais não devem ser somados como ocorrências independentes. O consumidor pode deduplicar pelos IDs ao resumir múltiplos episódios. A janela não é evidência causal da captura ou da vitória.

## Verificação e compatibilidade

```sh
npm run build
node scripts/validation/validate-vision.cjs
npm test -- --runInBand vision-calculator
npm run test:e2e -- --runInBand --testPathPatterns=vision-contract
TEST_DATABASE_URL=postgresql://integration:integration@localhost:55439/high_br_integration npm run test:integration -- --testPathPatterns=vision.integration-spec.ts
```

A última suíte limpa o banco descartável e exige reserva serial. Testes cobrem os dez jogadores, tipos futuros, campos ausentes/zero, eventos simultâneos, identidade repetida, fronteiras de fase/janela, censura, ausência de proveniência, denominador zero, políticas de gap, HTTP/OpenAPI e consulta às projeções reais. Esta tarefa não acrescenta projeção persistida nem altera processingVersion: utiliza as migrations/rebuilds da fundação. O payload lista evidências da família de visão e capturas; o tamanho medido no artefato descreve a fixture, não uma garantia de latência em produção.

Validação local de 23/09/2026: build e lint dos arquivos de produção aprovados; 316 unitários, 69 HTTP e1 integração PostgreSQL passaram na branch. A leitura persistida reconciliou novamente os dez participantes e preservou visionScore quando a fonte temporal foi removida no caso sintético de cobertura parcial.
