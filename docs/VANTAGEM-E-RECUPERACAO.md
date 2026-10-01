# Conversão de vantagem e recuperação — MET-28

Oportunidades E09, O09, O12 e H04. `GET /api/v1/analytics/advantage?patch=16.2&championId=100&role=TOP` descreve associação entre diferença de ouro frente ao único oponente da mesma posição, recursos/estruturas posteriores e vencedor real. A API exige campeão, posição canônica e patch interno exato (major.minor); não aceita `ALL`. MID é normalizado para MIDDLE. Fila padrão 420, mapa 11. `fromMs` inclusivo e `toMs` exclusivo filtram gameCreation; limit 1–10000, padrão 1000. Seleção determinística: gameCreation desc, matchId asc. Não é ranking universal de quem carregou, efeito causal ou recomendação de jogo.

## Política v1 e fontes

`ADVANTAGE_POLICY` versiona conjuntamente marcos de 10/15/20 minutos, horizonte de cinco minutos, bins e interpolação. Processamento deve estar COMPLETED, versão >=2. Leitura de count, partidas, participantes, projeções, eventos e status de processamento usa uma transação RepeatableRead. Nenhum agregado persistido novo, schema, migration ou rebuild é necessário; o cálculo é sob demanda sobre projeções existentes. Consulta usa contratos públicos de matches e filtros públicos de dataset.

Em cada marco t, seleciona-se frame **pastOnly** com offset [-60000,0] ms, sem consultar frame futuro e sem procurar outro frame para substituir ouro ausente no frame selecionado. Timestamp real e offset são publicados. Partida sem checkpoint válido não entra no denominador daquele marco. Projeção ausente/versão não suportada, duração curta, população desconhecida/ineligível, espelho de campeão ambíguo, roster incompleto/identidades duplicadas, papel focal/oponente ambíguo, vencedor inconsistente e timestamps duplicados são explicitamente excluídos. Timestamp duplicado exclui toda a partida para impedir escolha arbitrária de observação conflitante.

`goldLead = focal.totalGold − opponent.totalGold`, unidade ouro. Fonte: MatchTimelineProjection.frames com identidade puuid. Nunca usa goldGraph legado ou preenche null com zero. Bin deficit: g < -500; neutral: -500 <= g <= 500; lead: g > 500. Esses limiares são exploratórios, não validados como vantagem estratégica universal.

A janela posterior termina no checkpoint pastOnly em t+300000, com mesma tolerância; seus timestamps/offsets também são publicados. Exige duração/observação até t+300000. Um jogo terminado antes não entra em métricas posteriores, mas preserva seu checkpoint e resultado final válidos. `focalGoldGain` e `opponentGoldGain` mostram incremento observado de ouro total de cada participante; `leadChange = g_final − g_inicial`; recuperação é g_final >= 0 **somente** para o bin deficit. Não mede permanência da recuperação nem vitória contrafactual. Outcome vem de MatchParticipant.win e consistência entre equipes.

Estruturas contam identidades (frameIndex,eventIndex) distintas de BUILDING_KILL atribuídas à equipe focal no intervalo **(timestamp_inicial,timestamp_final]**. São recursos de equipe; não creditam autoria ao jogador. Evento sem timestamp, versão métrica incompatível ou geração diferente torna a contagem indisponível; atribuição desconhecida na janela também produz null. Zero só representa ausência válida de eventos na projeção elegível. Placas e monstros não entram nesta contagem.

## Integral e incerteza

Integral assinada na mesma janela observada: `Σ((g_i + g_(i+1))/2) × ((timestamp_(i+1) − timestamp_i)/60000)`, em **ouro-minuto**, interpolação linear por trechos/trapézios. Timestamps reais, não índices/minutos arredondados. Não extrapola até marcos nominais: startMs/endMs explicam os limites efetivos. Pontos ausentes, timestamps não crescentes ou gaps >90000 ms tornam integral null, motivo incomplete_or_gapped_window. Integral negativa é válida. Não converte área em probabilidade de vitória.

Cada célula checkpoint/bin publica N, wins, taxa de vitória e intervalo Wilson nominal 95%; recovery tem denominador próprio de déficits com horizonte posterior válido. N=0 retorna null/no_observations; N<30 retorna insufficient_sample. `leadChange`, `structures` e `integral` publicam N, mean e intervalo nominal normal `mean ±1.96×s/√N`, com variância amostral; N<2 deixa intervalo null. Constância na amostra pode produzir intervalo de largura zero e não prova ausência de variabilidade populacional. N>=30 tampouco garante precisão. Campos meanLeadChange/meanStructures/meanIntegral e seus Ns repetem os resumos para consumo simples.

São intervalos nominais, sem correção por jogadores recorrentes, células sobrepostas ou testes múltiplos. Checkpoints da mesma partida são correlacionados; não devem ser somados como partidas independentes. Composição/seleção da população importada, matchup e aquisição de recursos confundem associações. Ausências posteriores podem selecionar jogos mais longos. É preciso comparar cobertura e denominadores antes de interpretar resultados.

## Cobertura e exemplo sintético

`coverage` expõe availableMatches antes do limit, returnedMatches, distinctMatches, truncated e contagens de exclusão (algumas por partida, missing checkpoint por marco). Cada evidence identifica matchId, checkpoint, timestamps, ouro, bin, vencedor, recurso posterior, estruturas e limites da integral. `filters` identifica patch/campeão/posição/fila/período; nunca mistura silenciosamente estratos. Coorte vazia ainda retorna as nove células com Ns zero e ausências explícitas.

Payload completo gerado pelo cálculo: [met28-synthetic-example.json](analysis/met28-synthetic-example.json). Exemplo conferido pelo teste: no marco 600000 ms, g=-400 (neutral); em 900000 ms, g=600; incremento +1000 ouro, integral +500 ouro-minuto e uma estrutura da equipe focal. Duplicar essa estrutura e a partida não aumenta os denominadores. Com duas partidas sintéticas independentes idênticas, outcome N=2/wins=2/rate=1 com insuficiência explícita; integral N=2/mean=500. Isso é uma demonstração de cálculo, sem pretensão de representar amostra real ou patch real.

## Verificação

Testes unitários cobrem timestamps irregulares, sinal, gaps, missing gold, past-only, jogo curto, censura posterior, recuperação, atribuição desconhecida, duplicatas, ambiguidades e denominadores/incerteza. HTTP/OpenAPI valida resposta vazia e rejeição de ALL. Integração `test/integration/advantage.integration-spec.ts` preparada para PostgreSQL descartável: filtros reais de patch/período/limit/count, round-trip de snapshot com timestamp 900358 e ouro null e evento normalizado; execução serial pelo coordenador. Não executar em produção.
