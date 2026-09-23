# Timeline de ouro — MET-07 / O08

**Atualização MET-03:** a implementação atual usa O08 metricVersion=2 e MatchTimelineProjection, com timestampMs/frameIndex e preservação de todos os frames. A fonte temporal, limites de pares e política para dados antigos estão em [Snapshots de timeline](SNAPSHOTS-TIMELINE.md). As descrições de arrays/minutos abaixo documentam a implementação v1 histórica; a API atual não usa esses arrays nem reconstrói ausência a partir deles.

`GET /api/v1/matches/:matchId/timeline/gold` mantém a rota e os campos existentes. A correção altera `winner` para o resultado observado em `MatchTeam.win`; quantidade de ouro não determina vitória. Exige um registro para cada teamId 100/200, exatamente um vencedor e um perdedor. Resumo ausente retorna `winner=null, winnerReason=missing_field`; resumo contraditório/identidade inválida retorna `invalid_value`. Empate de ouro não desempata resultado. Match inexistente retorna 404; Match existente sem participantes/timeline retorna 200 com série vazia e motivos de ausência.

## Cálculo e população

O contrato tem `metricId=O08, metricVersion=1`. Não altera projeções persistidas nem PROCESSING_VERSION e não requer migration/rebuild. Esta é uma correção específica da resposta legada prevista em MET-01; não introduz o envelope de relatório de MET-17 nem fabrica processedAt para uma consulta.

A população são os participantes da partida solicitada, sem filtro por campeão, posição, patch, fila ou resultado. O formato de totais validado é Summoner's Rift (mapId 11), cinco participantes por time. Outros mapas mantêm o vencedor do resumo e retornam a série indisponível com `unsupported_version`; não se presume o formato de modos com outros tamanhos de time. `gameVersion` e `mapId` usados constam na evidência. A validação sintética usa o patch interno 16.2; não afirma suporte analítico validado a todos os patches.

Para cada índice legado de minuto:

- `blueTeam=sum(goldGraph[minute])` dos cinco participantes teamId=100, e equivalente teamId=200 para redTeam. Unidade: ouro. Origem: cálculo derivado de valores observados no campo persistido.
- Um total só existe quando o roster tem exatamente cinco participantes e todos os valores são finitos e não negativos. Campo/frame ausente ou série curta deixa o total `null`; Roster excedente, NaN, infinito e valores negativos ficam `invalid_value`. Time desconhecido não é atribuído a azul/vermelho. Zero numérico presente continua zero; ele nunca substitui um valor ausente na leitura.
- `difference=blueTeam-redTeam`, ou null quando falta um dos totais. `missingReasons` explica a ausência por time; `reason` é a primeira ausência (azul antes de vermelho).
- `maxAdvantage` é o primeiro índice válido com máximo `abs(difference)`. Se todos os pontos são empates, retorna diferença 0 e `team=null`. Sem ponto válido, retorna null e `maxAdvantageReason`.
- `observedSwing` é o primeiro par de índices consecutivos completos cuja `abs(afterDifference-beforeDifference)>3000` ouro. O limite é estrito. Expõe os dois índices e saldos usados. Não interpola lacunas, não compara pontos separados por ausência e não usa posição no array como minuto quando os índices diferem.

Não existe denominador estatístico para soma/diferença. Cobertura por time é amostras válidas / `max(5, tamanho do roster)`, com contagens explícitas. Cobertura da série é índices com ambos os totais completos / índices entre zero e a maior extensão de goldGraph presente. Sem índice, a cobertura é null (população desconhecida), não 0%. Ausências internas conhecidas contam no denominador; a cobertura não mede quanto da duração real foi capturado. `validAdjacentPairs` informa quantos pares foram avaliados para swing. `observedSwingReason=not_observed` significa que nenhum par válido ultrapassou o limiar; `missing_frame` significa que não havia par válido. Mesmo com pares válidos, baixa cobertura impede concluir que nenhum swing ocorreu em toda a partida.

## Tempo, evidência e limites

A fonte de ouro é `MatchParticipant.goldGraph`; a de resultado é `MatchTeam.win`, com os registros teamId/win devolvidos em `evidence.teams`. O gráfico mantém os índices de minuto legados (`timeBasis=legacy_minute_index`). O cálculo se limita aos índices disponíveis, inclusive o último; não extrapola até gameDuration, não consulta frames futuros nem estima timestamps exatos.

O parser legado inicializa lacunas com zero e pode sobrescrever frames que caem no mesmo minuto. Ausência já codificada como zero não pode ser recuperada só desse array. A cobertura publicada se refere à representação persistida, não garante completude do payload original. MET-03 preserva timestamps e ausências dos frames completos e será necessária para superar esse limite. Esta task não rotula como observado um timestamp que não está disponível.

## Migração do consumidor

1. Usar `observedSwing`, com rótulo “Variação observada de ouro”. `throwPoint` permanece como alias exato, marcado deprecated no OpenAPI; não há retirada nesta alteração.
2. Tratar `winner`, totais/diferença e maxAdvantage como nullable. Não voltar a inferir o vencedor pelo gráfico quando winner=null. Mostrar `team=null` do pico zero como empate.
3. Exibir cobertura e motivos de ausência. Uma lacuna deve interromper a linha do gráfico, sem preenchimento com zero.
4. Não chamar o swing de erro/culpa de jogador, virada de resultado ou causa de derrota: é uma diferença derivada entre dois totais observados, sem atribuição causal.

Exemplo **sintético**, executado pelos testes HTTP: azul tem `win=true`, vermelho `win=false`; no minuto 0 ambos têm 2.500 ouro; no minuto 1 azul tem 5.000 e vermelho 10.000. A resposta traz `winner=blueTeam`, `difference=-5000`, `observedSwing={beforeMinute:0, minute:1, beforeDifference:0, afterDifference:-5000, swing:5000}` e cobertura 2/2. Remover a segunda amostra de um jogador azul muda esse ponto para `blueTeam=null, redTeam=10000, difference=null`, cobertura do azul 4/5, cobertura da série 1/2 e `observedSwing=null` por falta de par completo. Sem participantes, o vencedor continua azul e a série é vazia, com maxAdvantage/swing null e missing_frame.

## Evidência de validação

- `npm test -- --runInBand gold-calculator match-gold-timeline.service match.repository`: 4 suítes, 23 testes aprovados; cálculo, resultado contraditório, empate, ausência, zero válido, limiar, fonte/consulta e serviço.
- `npm run test:e2e -- --runInBand gold-timeline.e2e-spec`: 4 testes, requisições HTTP reais atravessando controller, serviço, repositório e cálculo; apenas Prisma é substituído. Inclui 404 versus vazio e verificação do schema OpenAPI gerado.
- `npm run build`: aprovado. Não houve alteração persistida nem execução em produção.
