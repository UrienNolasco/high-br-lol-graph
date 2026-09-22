# Métricas que os dois JSONs permitem construir

Análise do par `exemplo_partida_BR1_3200579475.json` e `exemplo_partida_timeline_BR1_3200579475.json`, cruzada com a implementação atual do backend. Data do levantamento: 18/09/2026. O objetivo é identificar oportunidades e demonstrá-las com dados reais dos arquivos; não implementar endpoints ou alterar o banco neste levantamento.

## 1. O que foi efetivamente analisado

Os dois arquivos identificam a mesma partida `BR1_3200579475`, com os mesmos dez participantes. O resumo registra fila 420, mapa 11, versão `16.2.741.3171`, duração de 2.368 segundos (39:28) e vitória do time 100. O evento `GAME_END` confirma esse vencedor; seu relógio é 2.368.922 ms, mais preciso que o inteiro do resumo.

Foram percorridos todos os valores dos JSONs: 41 frames, 410 snapshots de participantes, 1.966 eventos de 18 tipos, 146 nomes de campos no nível de participante e 138 nomes de campos em `challenges` na união dos dez jogadores. Campos de challenges são opcionais: cada participante tem entre 126 e 131, não todos os 138. O inventário recursivo encontra 342 caminhos de campos no resumo e 109 na timeline, normalizando índices de arrays e IDs dos snapshots; são caminhos distintos, não quantidade de valores.

Artefatos reproduzíveis:

- [Script de análise](../scripts/analyze-example-match.py): Python padrão, sem serviços externos ou dependências adicionais.
- [Resultados e definições em JSON](analysis/BR1_3200579475.metrics.json): times, jogadores, checkpoints, objetivos, janelas temporais, validações e hashes dos arquivos de origem.
- [Inventário completo de campos e retenção no backend](analysis/BR1_3200579475.fields.csv).
- [Série temporal de ouro, abates e wards](analysis/BR1_3200579475.timeline.csv).

Reprodução: `python3 scripts/analyze-example-match.py`, a partir da raiz do repositório. O script também funciona quando chamado por caminho absoluto. A auditoria de retenção é estática, baseada nos parsers ativos; precisa ser revisada quando esses parsers mudarem.

## 2. A partida já revela um produto mais interessante que o placar

| Medida | Time 100 — vencedor | Time 200 — perdedor |
|---|---:|---:|
| Abates | 40 | 52 |
| Ouro final | 88.606 | 78.613 |
| Dano a campeões | 232.227 | 189.529 |
| Dano a torres | 36.129 | 29.920 |
| Torres destruídas | 7 | 6 |
| Dragões | 3 | 3 |
| Barões | 0 | 2 |
| Arautos | 0 | 1 |
| Vastilarvas, conforme `horde.kills` | 0 | 3 |
| Wards colocadas, reconciliadas | 109 | 87 |
| Wards destruídas | 18 | 33 |
| Control wards colocadas | 9 | 12 |
| Control wards compradas | 9 | 14 |
| Soma de vision score | 213 | 269 |
| Cura em aliados | 16.618 | 12.870 |
| Escudos em aliados | 19.049 | 4.071 |
| Tempo morto somado dos jogadores | 1.811 s | 1.365 s |

O vencedor teve menos abates, menos vision score e nenhum Barão. Isso não demonstra que abates, visão ou Barão não importam. Demonstra que uma análise individual precisa mostrar outras dimensões: distribuição de recursos, pressão em estruturas, momento das mortes e aproveitamento das vantagens.

O tempo morto somado é expresso em jogador-segundos: períodos podem se sobrepor. Não representa 1.811 segundos com o time inteiro morto. Cura/escudo somados são contribuições registradas, não estimativa de mortes evitadas.

### A armadilha das 752 wards

| Contagem na timeline | Time 100 | Time 200 | Total |
|---|---:|---:|---:|
| Todo evento `WARD_PLACED` | 154 | 598 | 752 |
| Eventos `UNDEFINED` | 45 | 511 | 556 |
| Tipos de ward identificados | 109 | 87 | 196 |
| `wardsPlaced` do resumo | 109 | 87 | 196 |

Os tipos identificados nesta amostra são `YELLOW_TRINKET`, `BLUE_TRINKET`, `SIGHT_WARD` e `CONTROL_WARD`. A exclusão dos 556 `UNDEFINED` reconcilia as contagens **para cada um dos dez jogadores**, não apenas para os times. A Zyra concentra 434 eventos indefinidos, Zoe 77 e Milio 45. Os arquivos não explicam a semântica exata desses eventos; não os classificamos como plantas, habilidades ou wards convencionais por suposição.

Uma implementação ingênua diria que o perdedor colocou quase quatro vezes mais wards. A contagem reconciliada mostra o contrário: o vencedor colocou 22 a mais. Portanto, a primeira métrica nova deve vir acompanhada de uma regra de qualidade, e tipos desconhecidos devem permanecer separados para investigação.

Também não basta trocar quantidade por vision score: o time que colocou menos wards teve maior soma de vision score e mais remoções. São dimensões distintas. Aqui, `knownWardsPerTeamMinute` é 2,762 contra 2,204, dividindo pela duração da partida, sem dividir novamente pelos cinco jogadores.

### Como a vantagem mudou

| Snapshot aproximado | Ouro: time 100 menos time 200 | Abates 100–200 |
|---|---:|---:|
| 22:00 | −4.750 | 15–31 |
| 28:00 | +455 | 22–39 |
| 30:00 | +4.566 | 28–42 |
| 35:00 | +3.924 | 32–48 |
| Final, 39:28 | +9.993 | 40–52 |

A maior desvantagem de ouro observada nos snapshots foi 4.750. A partir do snapshot de 28:00, todos os snapshots restantes mostram vantagem do time 100. Não é possível afirmar o segundo exato da virada entre frames; a série tem resolução próxima de um minuto.

No primeiro Barão, às 20:44, o time 200 havia registrado cinco abates e nenhuma morte nos 60 segundos anteriores. Comparando os snapshots de 20:00 e 23:00, sua vantagem cresceu de 1.744 para 4.350: +2.606. No segundo Barão, às 32:28, a diferença desse time passou de −3.373 em 32:00 para −3.924 em 35:00: piora de 551.

Isso é **variação de ouro do mapa em uma janela que contém a captura**, não “ouro gerado pelo buff do Barão”. Inclui farm, torres, recompensas e ações de todos os jogadores; não identifica portadores ou duração efetiva do buff. A comparação é útil para levantar a pergunta “o que aconteceu depois do objetivo?”.

Outro exemplo de resposta no mapa: o time 200 destrói o inibidor do meio às 22:18; 5,377 segundos depois, Fiora destrói uma torre interna do top do time 200. A sequência permite mostrar troca de estruturas em lados diferentes do mapa. Sozinha, não prova que a troca foi planejada ou vantajosa.

### Uma leitura por jogador

KP = `(kills + assists) / kills do time`. Ouro@15 é diferença contra o adversário da mesma posição. O snapshot usado para @15 está em 15:00,358, explicitado no JSON de resultados.

| Jogador | Time | K/D/A | KP | Wards colocadas / removidas | Ouro@15 | CS@15 diferencial | % do jogo morto |
|---|---:|---|---:|---:|---:|---:|---:|
| Fiora | 100 | 19/5/7 | 65,0% | 13 / 4 | +3.088 | +38 | 9,0% |
| Karthus | 100 | 4/9/16 | 50,0% | 16 / 1 | +692 | 0 | 13,7% |
| Quinn | 100 | 13/18/3 | 40,0% | 14 / 4 | −605 | −19 | 25,7% |
| Varus | 100 | 3/8/17 | 50,0% | 20 / 3 | −394 | −7 | 10,3% |
| Milio | 100 | 1/12/20 | 52,5% | 46 / 6 | +59 | −3 | 17,8% |
| Singed | 200 | 9/9/6 | 28,8% | 16 / 4 | −3.088 | −38 | 11,2% |
| Aatrox | 200 | 12/8/7 | 36,5% | 10 / 8 | −692 | 0 | 13,0% |
| Zoe | 200 | 16/8/15 | 59,6% | 9 / 8 | +605 | +19 | 13,1% |
| Zyra | 200 | 15/7/14 | 55,8% | 9 / 3 | +394 | +7 | 10,5% |
| Zilean | 200 | 0/8/30 | 57,7% | 43 / 10 | −59 | +3 | 9,8% |

Quatro narrativas que o produto já poderia sustentar:

- **Fiora converte recursos em pressão de estruturas:** 28,06% do ouro do time, 34,98% do dano a campeões e **79,14% do dano a torres**. Foram 28.592 de dano a torres, quatro torres finalizadas e seis abates sem assistentes registrados antes dos 15 minutos. É evidência de contribuição em estruturas; “split push eficiente” exigiria definição temporal/espacial adicional.
- **Milio tem uma contribuição que DPM não captura:** 13.741 de cura em aliados, 19.049 de escudos, 46 wards e 52,5% de KP. Julgá-lo pela participação de 2,51% no dano do time apagaria boa parte de sua função.
- **Quinn merece uma análise de janelas de morte:** 608 segundos morto, 25,7% da partida; oito mortes precedem ao menos um objetivo adversário em até 60 segundos pela definição do script. As janelas podem sobrepor; isso é associação temporal e não atribuição de culpa. O total de 13 abates sozinho não mostra esse contexto.
- **Zyra entrega dano mesmo na derrota:** 36,68% do dano do time com 23,76% do ouro. A razão entre essas participações é aproximadamente 1,54. Essa medida descreve produção relativa de dano; não é nota de habilidade nem corrige diferenças de campeão, dano de poke e composição.

Há ainda um cuidado com métricas de sobrevivência: Karthus recebe um abate registrado **4,026 segundos depois de sua própria morte** no final da partida. Uma regra universal que trate toda morte como fim imediato de contribuição ou todo dano sofrido como desempenho ruim seria inadequada.

## 3. O que já existe e o que apenas parece existir

| Família | Situação atual do projeto |
|---|---|
| K/D/A, resultado, ouro, dano a campeões, dano recebido e vision score | Persistidos; KDA e métricas por minuto são calculados |
| Gráficos de ouro, XP, CS e dano | Persistidos por participante; API usa ouro por time e médias de ouro/CS na comparação |
| CSD/GD/XPD aos 15 | Já calculados em agregados por jogador/campeão; merecem tratamento de ausência e acesso por partida |
| Win rate, desempenho por campeão, posições e atividade | Já existem; não são propostas novas |
| Abates e mortes no mapa | Coordenadas/timestamps retidos; vínculo explícito killer–victim, assistentes e contexto de recompensa descartados |
| Wards | Colocações retidas com `wardType`, incluindo indefinidos; coordenadas inventadas como `(0,0)`; remoções não são persistidas pelo handler |
| Objetivos | Parser extrai eventos, mas persistência salva os totais de `team.objectives` no lugar da lista de eventos |
| Itens | Compras/vendas e undo parcialmente retidos; slots finais não são salvos, e build calculada a partir de compras não reconstrói inventário |
| Habilidades | Sequência Q/W/E/R retida, sem timestamp; evolução do nível do campeão descartada |
| `challenges` | JSON inteiro é salvo e pode aparecer no detalhe bruto; não há análises dedicadas para a maioria dos seus campos |
| Runas e pings | Retidos como JSON; não há análises de desempenho por escolha de runa ou comportamento de comunicação |
| Solo kills/deaths aos 15 na comparação | Campos retornam zero fixo, apesar de eventos suficientes para uma contagem explícita |

Referências de código: [parser de partida](../src/modules/worker/pure/match.parser.ts), [parser de timeline](../src/core/riot/timeline-parser.service.ts), [persistência](../src/modules/worker/services/match-persistence.service.ts), [agregações](../src/core/stats/player-stats-aggregation.service.ts), [analytics](../src/modules/analytics/services/analytics.service.ts), [performance](../src/modules/matches/pure/performance-calculator.ts).

## 4. Catálogo priorizado de oportunidades

Legenda de disponibilidade:

- **Banco:** derivável dos campos atualmente persistidos, após conferir qualidade e modalidade.
- **JSON bruto:** valor já salvo em `challenges`/runas/pings, sem análise dedicada.
- **Ingestão:** disponível nos arquivos, mas precisa passar a ser preservado ou corrigido no pipeline.
- **Estimativa:** precisa de convenção explícita, limiar ou informação adicional; não equivale a uma observação direta.

P0 = corrigir/viabilizar fundamentos; P1 = alto valor para primeira versão analítica; P2 = expansão após validar a base. “P” indica jogador; “T”, time; “H”, análise histórica. As prioridades são propostas de produto, não medições de impacto.

### Visão e controle de informação

| ID / prioridade | Métrica e nível | Fonte / cálculo | Disponibilidade e limite |
|---|---|---|---|
| V01 / P0 | Wards colocadas por tipo e fase — P/T | `WARD_PLACED.creatorId`, `wardType`, timestamp; reconciliar com `wardsPlaced` | Banco para colocações, após filtrar tipos identificados; manter desconhecidos separados |
| V02 / P1 | Wards removidas por tipo e fase — P/T | `WARD_KILL.killerId`; total `wardsKilled` | Ingestão; `challenges.wardTakedowns` já oferece total alternativo |
| V03 / P1 | Control wards compradas e colocadas — P/T | `visionWardsBoughtInGame`, `detectorWardsPlaced`, eventos | Compra exige ingestão; colocação também recuperável de eventos/challenges; compra não é colocação |
| V04 / P1 | Participação individual na visão do time — P | `visionScore / soma do time`; também participação nas colocações/remoções | Banco para score/colocação; distinguir visão pontuada de quantidade |
| V05 / P1 | Frequência de ward e maior intervalo sem colocar — P | Contagem/tempo elegível e diferenças entre timestamps identificados | Banco; intervalo sem colocar não significa mapa sem visão ou trinket disponível |
| V06 / P1 | Atividade de visão antes de captura de objetivo — P/T | Colocações e remoções nos 60/90 s anteriores | Ingestão para remoções/objetivos; medida global do mapa, sem presumir visão no rio |
| V07 / P1 | Desvantagem de visão por fase — T | Diferença de V01/V02 em janelas fixas, ex. até 10/15/20 | Banco + ingestão; evitar usar totais finais como preditores de um instante anterior |
| V08 / P2 | Investimento/resultado de visão por posição — P/H | Control wards, score, colocações e remoções vs referência do mesmo campeão/role/patch | Ingestão + histórico; custo monetário depende das regras do patch e da quest |

O número de wards removidas pelo time dividido pelas wards colocadas pelo adversário pode ser um indicador descritivo, mas não deve ser chamado de “percentual de todas as wards inimigas destruídas” sem reconciliar tipos e regras de contagem. Não há ID de ward para ligar instalação e destruição nesta timeline.

### Lane, economia e progressão

| ID / prioridade | Métrica e nível | Fonte / cálculo | Disponibilidade e limite |
|---|---|---|---|
| E01 / P1 | CS, ouro e XP aos 5/10/20, além dos 15 já existentes — P/T | Snapshot no checkpoint e diferença vs adversário da mesma posição | Banco aproximado por arrays; preservar timestamp exato para o contrato novo |
| E02 / P1 | Farm de lane separado de jungle — P | `minionsKilled` e `jungleMinionsKilled`; final `totalMinionsKilled`, `neutralMinionsKilled` | Ingestão; atualmente CS junta componentes; challenges têm alguns recortes antecipados |
| E03 / P1 | Curva de ganho de recursos por fase — P/T | Diferença de gold/CS/XP entre frames, dividida pelo tempo real transcorrido | Banco; zeros faltantes não podem virar perda real; intervalo final não é minuto completo |
| E04 / P1 | Distribuição de recursos — P/T | Participação de ouro e CS; concentração no maior acumulador | Banco; descreve distribuição, não justiça da distribuição |
| E05 / P1 | Ouro não gasto nos snapshots — P/T | `currentGold`, máximo/mediana, proporção de snapshots acima de limiar | Ingestão; não usar `goldEarned − goldSpent`; não equivale a ouro desperdiçado |
| E06 / P2 | Recurso não gasto antes de episódio de combate — P | Snapshot anterior ao episódio + tempo desde snapshot | Ingestão + estimativa; não é inventário/caixa exato no segundo da luta |
| E07 / P1 | Nível e diferença de nível nos checkpoints — P | `participantFrames.level`; tempo até níveis observados em `LEVEL_UP` | Ingestão; limites dependem da versão/posição, não fixar 18 |
| E08 / P1 | Abates sem assistentes aos 10/15 e mortes equivalentes — P | `CHAMPION_KILL` sem `assistingParticipantIds`, com autor válido | Ingestão para vínculo completo; total final já em challenges; não comprova duelo isolado |
| E09 / P2 | Conversão da vantagem de lane — P/H | Relação entre lead@15 e ganho posterior de estruturas/recursos/resultado | Ingestão + histórico; estratificar campeão/role, duração e partida elegível |
| E10 / P2 | Recursos de jungle adversária e aliados — P | `totalEnemyJungleMinionsKilled`, `totalAllyJungleMinionsKilled`, challenges correspondentes | Ingestão / JSON bruto; não representa rota exata dos campos |

### Combate, sobrevivência e contribuição

| ID / prioridade | Métrica e nível | Fonte / cálculo | Disponibilidade e limite |
|---|---|---|---|
| C01 / P1 | Participação em abates (KP) — P | `(kills + assists) / kills do time`, total e por fase | Banco no total / ingestão por fase; denominador zero gera ausência, não bom desempenho |
| C02 / P1 | Participação no dano e razão dano/ouro — P | `damage / teamDamage`; dividir pela participação no ouro | Banco; referência por campeão/posição, sem rotular suporte como ineficiente |
| C03 / P1 | Distribuição do dano físico/mágico/verdadeiro — P/T | Campos `*DamageDealtToChampions` e `*DamageTaken` | Ingestão; mostra composição de dano efetivamente causado/recebido |
| C04 / P1 | Cura e escudos em aliados — P/T | `totalHealsOnTeammates`, `totalDamageShieldedOnTeammates`, por minuto | Ingestão; challenges oferecem `effectiveHealAndShielding`; separar cura própria |
| C05 / P1 | Controle de grupo — P/T | `timeCCingOthers`, `enemyChampionImmobilizations` | Ingestão / JSON bruto; `totalTimeCCDealt` tem outra semântica, não somar indiscriminadamente |
| C06 / P1 | Tempo morto — P/T | `totalTimeSpentDead / timePlayed`; soma em jogador-segundos | Ingestão; considerar campeão/posição e contribuição pós-morte |
| C07 / P1 | Mortes próximas a objetivos adversários — P | Objetivo em `(morte, morte+60s]`; lista de ocorrências e taxa por morte elegível | Ingestão; descrever associação; janelas sobrepostas não são perdas adicionais independentes |
| C08 / P1 | Recompensas de shutdown recebidas/cedidas — P/T | `shutdownBounty` dos eventos de abate; challenges `bountyGold` como medida distinta | Ingestão / JSON bruto; não somar `bounty` + `shutdownBounty` sem validar significado do patch |
| C09 / P1 | Quem matou quem e quem ajudou — P/P | Matriz killer–victim e rede de co-participação dos assistentes | Ingestão; mostrar relações nesta partida, não assumir premade ou intenção |
| C10 / P2 | Troca rápida após morte — P/T | Abate adversário após morte em janela de 10 s e região definida | Ingestão + estimativa; publicar limiares e evitar dupla atribuição |
| C11 / P2 | Episódios de abates agrupados — T | Agrupar kills por tempo/posição e medir saldo/participantes | Ingestão + estimativa; não captura lutas sem mortes, iniciação, peel ou todas as teamfights |
| C12 / P2 | Execução mecânica descritiva — P/H | `skillshotsHit`, `skillshotsDodged`, `outnumberedKills`, `saveAllyFromDeath` | JSON bruto; hits não fornecem tentativas suficientes para uma taxa universal de acerto |

### Objetivos, estruturas e recuperação

| ID / prioridade | Métrica e nível | Fonte / cálculo | Disponibilidade e limite |
|---|---|---|---|
| O01 / P0 | Cronologia correta de objetivos — T | `ELITE_MONSTER_KILL` usa `killerTeamId`; `BUILDING_KILL.teamId` é dono da estrutura destruída | Ingestão corrigida; separar totais finais de eventos |
| O02 / P1 | Participação em objetivos — P | Autor + `assistingParticipantIds`; dano final em épicos/estruturas como dimensão separada | Ingestão; assistente registrado não equivale a todos os presentes |
| O03 / P1 | Pressão em estruturas — P/T | Dano a torres, participação no time, `turretKills` e `turretTakedowns` | Ingestão; não confundir último golpe com participação |
| O04 / P1 | Eventos de placas por lane/fase/time — P/T | `TURRET_PLATE_DESTROYED`, posição, lane e dono da torre | Ingestão; 28/74 eventos têm killerId=0; não atribuir ouro inteiro ao último golpe |
| O05 / P1 | Abates seguidos de objetivo — T | Fração de abates/episódios elegíveis com captura em até 60/90 s | Ingestão; fixar unidade do denominador, permitir fim de jogo/objetivo indisponível como contexto |
| O06 / P1 | Variação de vantagem após objetivo — T | Diferença de ouro em frames antes/depois, com timestamp real | Banco + ingestão; contexto do mapa inteiro, não efeito causal/buff power play |
| O07 / P1 | Troca de objetivos entre times — T | Eventos opostos próximos no tempo, com tipo/lane | Ingestão; chamar de troca temporal, sem inferir planejamento |
| O08 / P1 | Maior déficit superado e manutenção da vantagem — T | Mínimo da diferença, mudanças de sinal e persistência nos snapshots | Banco; usar vencedor real, não inferido por ouro |
| O09 / P2 | Ouro acumulado durante vantagem e área sob a curva — T | Integrar diferença de ouro no tempo com regra explícita de interpolação | Banco; unidade ouro-minuto, não probabilidade de vitória |
| O10 / P2 | Janela de objective bounty — T | `OBJECTIVE_BOUNTY_PRESTART.actualStartTime` e FINISH | Ingestão; respeitar time, ausência/fim censurado e regras do patch |
| O11 / P2 | Roubo e contestação registrados — P/T | `objectivesStolen`, `epicMonsterSteals`, assists e challenges de proximidade | Ingestão / JSON bruto; não permite contar todas as tentativas falhadas |
| O12 / P2 | Recuperação por posição — P/H | Lead/deficit individual por fase + contribuição posterior ao time | Banco + ingestão; comparar amostras equivalentes, sem ranking universal de “carregou” |

### Builds, escolhas e comportamento

| ID / prioridade | Métrica e nível | Fonte / cálculo | Disponibilidade e limite |
|---|---|---|---|
| B01 / P0 | Inventário final correto — P | `item0..item6` **e `roleBoundItem`**; preservar slots | Ingestão; `roleBoundItem` pode ser item de quest ou equipamento, exige catálogo da versão |
| B02 / P1 | Tempo de aquisição de itens relevantes — P/H | Compras + vendas + destroyed + undo e catálogo por patch | Ingestão parcialmente existente; compra desfeita não é aquisição definitiva |
| B03 / P2 | Ordens de compra e escolhas situacionais — P/H | Sequências, campeão/role, recursos no instante e composição adversária | Ingestão + histórico/catálogo; win rate final por item tem viés de vantagem e duração |
| B04 / P1 | Ordem e timing de habilidades — P/H | `SKILL_LEVEL_UP` com timestamp, slot e tipo | Sequência no banco; timings exigem ingestão; não mede uso eficaz das habilidades |
| B05 / P2 | Runas e feitiços por matchup — P/H | `perks`, IDs de summoner spells, resultado e contexto | JSON bruto/banco; avaliar tamanho de amostra e seleção de jogadores |
| B06 / P2 | Frequência de casts na partida — P | Totais `spell1..4Casts`, `summoner1/2Casts`, divididos pela duração; não há log completo de casts na timeline | Ingestão; somente totais, sem inventar timestamps ou cooldowns desperdiçados |
| B07 / P2 | Perfil de comunicação descritivo — P/H | Contagem dos diferentes `*Pings`, normalizada pela duração | JSON bruto; pings não revelam intenção, qualidade da comunicação ou toxicidade |
| B08 / P2 | Presença amostrada em regiões do mapa — P | `pathingSample` e regiões versionadas por mapa | Banco + estimativa; amostra de 60 s não oferece tempo exato em cada região |

### Métricas históricas para orientar melhoria

| ID / prioridade | Métrica e nível | Fonte / cálculo | Disponibilidade e limite |
|---|---|---|---|
| H01 / P1 | Referência por campeão/posição/patch | Distribuição e percentis das métricas anteriores, com N e cobertura | Histórico; não misturar suporte com carry nem modalidades diferentes |
| H02 / P1 | Evolução do próprio jogador | Comparar janelas anteriores/posteriores sob filtros consistentes | Histórico; explicitar mudanças de campeão, patch e composição da amostra |
| H03 / P1 | Associação entre visão antecipada e vitória | Wards/remoções até t versus resultado, com contexto até t | Histórico; protocolo na seção 7; não causal |
| H04 / P2 | Conversão de vantagem de lane em vitória | Vitória condicional ao diferencial@15 por role/champion | Histórico; excluir partidas encerradas antes do checkpoint |
| H05 / P2 | Frequência de mortes antes de objetivos | C07 por morte/jogo, com oportunidades observadas e intervalos de incerteza | Histórico; evitar culpar um jogador pelo efeito do estado do time |
| H06 / P2 | Sinergias e confrontos observados | Coocorrência de campeões, lane opponent, resultados e contexto | Histórico; contagem de observações não prova sinergia causal e fragmenta amostra |

São **56 oportunidades catalogadas**: 8 de visão, 10 de economia, 12 de combate, 12 de objetivos, 8 de escolhas e 6 históricas. Algumas são novas formas de expor dados já disponíveis; outras exigem retenção adicional. O valor maior está em conectar famílias, por exemplo visão antes de objetivo + mortes na janela + troca de estruturas.

## 5. Campos/eventos que não devem continuar sendo perdidos

| Evento na amostra | Quantidade | Tratamento atual / informação adicional aproveitável |
|---|---:|---|
| `WARD_PLACED` | 752 | Retém tipo/tempo, mas mistura 556 indefinidos; não há coordenadas no evento |
| `WARD_KILL` | 51 | Handler não persiste; perder isso apaga remoção de visão por fase |
| `CHAMPION_KILL` | 92 | Retém posições, perde vínculo explícito, assistentes, recompensa e recap de dano |
| `CHAMPION_SPECIAL_KILL` | 12 | Ignorado; contexto de multikill e first blood |
| `ELITE_MONSTER_KILL` | 12 | Parseado, mas eventos não chegam ao banco |
| `BUILDING_KILL` | 15 | Mesmo problema; inclui 13 torres e 2 inibidores |
| `TURRET_PLATE_DESTROYED` | 74 | Ignorado; potencial de pressão por lane/tempo |
| `DRAGON_SOUL_GIVEN` | 1 | Ignorado; neste arquivo `teamId=0`, logo não atribuir uma alma a um time |
| `ITEM_PURCHASED` | 292 | Retido parcialmente; compras removidas durante processamento de undo |
| `ITEM_SOLD` | 19 | Retido; efeitos não considerados na aproximação atual de build final |
| `ITEM_DESTROYED` | 277 | Ignorado; composições/consumos/transições exigem semântica do item |
| `ITEM_UNDO` | 18 | Retém `beforeId` e tempo, perde `afterId` e `goldGain` |
| `SKILL_LEVEL_UP` | 177 | Mantém sequência sem timestamp |
| `LEVEL_UP` | 170 | Ignorado; curva de progressão e milestones de nível |
| `OBJECTIVE_BOUNTY_PRESTART` | 1 | Ignorado; início programado é diferente do timestamp do anúncio |
| `OBJECTIVE_BOUNTY_FINISH` | 1 | Ignorado; término da janela |
| `PAUSE_END` | 1 | Ignorado; informação de relógio, não prova duração de todas as pausas |
| `GAME_END` | 1 | Ignorado na timeline; útil para reconciliar vencedor e encerramento |

Nos snapshots, o backend preserva ouro acumulado, XP, CS total, dano a campeões e posição. Deixa de preservar `currentGold`, `level`, `timeEnemySpentControlled`, atributos do campeão e decomposição do dano. A retenção de timestamps deve acompanhar os valores: existem 41 frames, mas apenas 40 índices distintos de `floor(timestamp/60000)`; o último frame sobrescreve o anterior no índice 39 no parser atual.

No resumo, as prioridades são guardar totais de wards, dano a estruturas/épicos, cura/escudo aliados, tempo morto, tipos de dano, itens finais/roleBoundItem, dados de surrender e Riot ID. Todos os dez `summonerName` estão vazios; nomes de exibição estão em `riotIdGameName`/`riotIdTagline`.

Os tipos TypeScript também precisam acompanhar o payload observado: o recap de dano contém `magicDamage`, enquanto interfaces locais declaram `magicalDamage`; `victimDamageReceived` não oferece o `totalDamage` exigido pela interface. Um DTO declarado não comprova que aquele campo existe no JSON. Antes de criar métricas sobre esses recaps, usar validação do payload e testes de contrato com os campos reais.

`challenges` já contém várias oportunidades sem buscar novamente a Riot: KP, damage share, solo kills, bounties, takedowns de objetivos, farm inicial, wards por tipo, remoções, saves, immobilizações, skillshots e indicadores de pressão. Primeiro promova os campos úteis para métricas com contrato; guardar JSON não significa que já estamos oferecendo a análise. Campos SWARM/ARAM presentes com zero não são relevantes para este recorte de Ranked Solo/Duo.

## 6. Limites que impedem conclusões falsas

1. **Wards não têm posição ou ID próprio nestes eventos.** Não é possível reconstruir cobertura exata do mapa, vida de cada ward, área revelada ou a ward específica removida. Posição do jogador no minuto próximo é apenas uma estimativa, especialmente fraca para colocação à distância.
2. **Amostras de um minuto não descrevem movimentação contínua.** Não fornecem rota exata de jungle, tempo preciso de roaming, tentativa de gank sem abate, recall exato ou instante de chegada de todos a uma luta.
3. **Kills não são todas as lutas.** Agrupar kills não encontra confrontos sem mortes e pode unir ações distantes. Dano do recap de morte não é log completo de dano da partida.
4. **Não há visão contínua de waves, posição de minions ou disponibilidade de last hits.** CS baixo não comprova quantidade de minions perdidos por erro mecânico; proxy de pressão de lane precisa de rótulo próprio.
5. **Cooldown e disponibilidade de feitiços não são reconstruíveis a partir de casts totais.** Não afirmar “morreu com Flash disponível” ou “não usou ultimate” com esses arquivos.
6. **Elo/MMR no momento da partida não está nestes JSONs.** Rank atual de `User` não é substituto confiável de elo histórico. Se coletado externamente, guardar timestamp e distinguir aproximação.
7. **Build ótima, mérito individual e causa da vitória não saem de uma partida.** São questões de comparação contextual, e mesmo correlação histórica não resolve causalidade sozinha.
8. **O fim é compatível com surrender:** `gameEndedInSurrender=true` no resumo. Não tratar toda vitória como destruição observada de Nexus; não existe `BUILDING_KILL` de Nexus neste conjunto.

Regras de jogo também mudam. Este arquivo tem nível 20 no top, 60 eventos de placas após 14 minutos e equipamento em `roleBoundItem` dos bot laners. As notas oficiais da atualização 26.1 descrevem aumento do limite de nível para top após quest, placas permanentes e espaço de equipamento associado à quest de bot. Isso explica por que validar tudo com regras antigas produziria falsos alertas. A semântica deve ser versionada pelo `gameVersion`, sem assumir que o texto da versão interna é igual ao nome público do patch. [Notas oficiais 26.1](https://www.leagueoflegends.com/en-sg/news/game-updates/patch-26-1-notes/).

Exemplos adicionais de cautela observados: `goldSpent` da Fiora (26.143) é maior que `goldEarned` (24.864), logo a diferença não serve como saldo; `turretPlatesTaken=23` nos challenges dela difere dos 19 eventos com ela como killerId, logo não são automaticamente a mesma contagem; `DRAGON_SOUL_GIVEN` tem `teamId=0` às 12:35 e não permite declarar alma conquistada por algum time.

Os checkpoints calculados neste relatório usam o frame mais próximo e registram o desvio. Para análises preditivas “até t”, deve-se usar apenas frames/eventos disponíveis até t ou fixar uma tolerância que não utilize informação futura; arredondar silenciosamente um frame futuro cria vazamento de informação.

## 7. Como estudar se wards se relacionam com vitória

A pergunta precisa especificar exposição, momento e população. Uma proposta inicial é: **“Em partidas Solo/Duo do mesmo patch, maior atividade de visão até os 15 minutos está associada a maior chance de vitória, considerando o estado do jogo até esse instante?”**

Uma linha por partida pode conter diferenças time 100 − time 200:

```text
matchId, patch, queueId, mapId, sourceCohort, duration, winnerTeamId
wardPlacementsDiffUntil15, wardKillsDiffUntil15, controlWardsDiffUntil15
goldDiffAt15, killDiffUntil15, towerDiffUntil15
champions/roles dos dois times, contexto de rank observado (se houver)
unknownWardEvents, featureTimestamp, featureVersion, eligibleSample
```

Procedimento proposto:

1. Deduplicar por `matchId` e excluir/informar partidas sem cobertura até 15 min, remakes e modalidades diferentes. Um jogador que importa a mesma partida duas vezes não cria duas observações.
2. Validar colocações/remoções da timeline contra os totais do resumo. Guardar contagem de tipos desconhecidos e taxa de cobertura; não converter falha em zero.
3. Apresentar primeiro uma associação descritiva: faixas de diferença de wards, número de partidas, win rate e intervalo de incerteza. O recorte deve expor empates na contagem e possíveis diferenças entre os lados.
4. Separar quantidade colocada, removida e control wards. Vision score final não é feature “até 15”, pois estes arquivos não fornecem sua evolução temporal.
5. Comparar modelos com contexto até 15 e depois adicionar métricas de visão. Avaliar melhoria fora da amostra, calibração e estabilidade por patch; não interpretar automaticamente o coeficiente como efeito de colocar uma ward extra.
6. Manter a partida inteira no mesmo conjunto de treino/teste. Se forem usadas duas linhas por partida, agrupá-las por matchId. Preferir avaliação temporal e considerar dependência entre partidas dos mesmos jogadores.
7. Para a pergunta individual, controlar posição/campeão e participação do jogador no time. Dez participantes de uma partida não representam dez resultados independentes.
8. Testar sensibilidade em checkpoints 10/15/20 e janelas, sem selecionar apenas a configuração que produziu a associação desejada. Registrar hipótese e critério antes de avaliar o conjunto final.

Há causalidade reversa possível: estar vencendo pode permitir colocar/remover mais wards. Também há mediação: ouro aos 15 pode ser consequência da visão anterior. Ajustá-lo responde a uma pergunta condicional de previsão e não identifica o efeito causal total de wardar. A duração final da partida não deve ser adicionada como feature de previsão aos 15, porque ainda não era conhecida.

Uma segunda pergunta, mais localizada, é: “atividade de visão nos 90 s anteriores a um objetivo está associada à captura?”. Usar apenas objetivos efetivamente capturados cria uma amostra selecionada; ela não contém todas as tentativas, desistências e objetivos ignorados. Para avaliar oportunidades completas seria necessário modelar disponibilidade/spawn por patch e definir janelas de risco, preservando essa limitação.

Com **uma partida**, este levantamento valida extração e produz hipóteses. Não estima efeito, significância, probabilidade confiável de vitória ou quantidade ideal de wards.

## 8. Como transformar isso em funcionalidades úteis

### Primeira entrega: explicar a contribuição

Um painel por jogador com quatro dimensões separadas: recursos, combate, visão e estruturas. Mostrar valores, posição relativa dentro do time e referência histórica quando existir. Não condensar tudo em uma nota única antes de validar os pesos.

Exemplo de cartão factual: “Fiora: 28% do ouro, 35% do dano a campeões e 79% do dano a torres do time”. Para Milio, o destaque muda para cura, escudo, KP e visão. Comparações devem respeitar o papel de cada campeão.

### Segunda entrega: explicar momentos da partida

Uma timeline de viradas liga diferença de ouro, mortes e objetivos. Cada anotação contém evidências clicáveis, timestamps e uma definição transparente:

- “20:44 — time 200 capturou Barão após registrar 5 abates nos 60 s anteriores.”
- “22:18–22:23 — inibidor do meio trocado temporalmente por torre interna do top.”
- “28:00 — primeiro snapshot da vantagem de ouro mantida até o fim pelo time 100.”

Evitar textos causais como “esta morte perdeu o jogo”. Uma anotação deve mostrar a sequência observada e permitir ao usuário inspecioná-la.

### Terceira entrega: progresso pessoal e hipóteses históricas

Identificar padrões recorrentes com amostra suficiente: “Nas suas partidas recentes de X nesta posição, CS@10 subiu, mas a frequência de mortes antes de objetivos também aumentou”. A comparação precisa mostrar N, período, campeão/role/patch e cobertura. Com amostra pequena, mostrar os episódios em vez de inventar uma tendência.

## 9. Retenção e schema que sustentam essas análises

Este é um desenho proposto, não uma migration aplicada:

```text
Match
  patch, queue, map, duration, result, surrender flags
  ingestionVersion, parserVersion, processingState

MatchParticipant
  métricas finais tipadas: wards, dano por alvo/tipo, cura/escudo,
  tempo morto, farm de lane/jungle, inventory slots, roleBoundItem

MatchParticipantFrame
  matchId, participantId/puuid, timestampMs
  goldTotal, goldCurrent, xp, level, laneCs, jungleCs, posição

MatchEvent
  matchId, frameIndex, eventIndex, timestampMs, type
  actorParticipantId?, victimParticipantId?, assistants[]
  actorTeamId?, destroyedTeamId?, wardType?, objetivo?, posição?
  payload original para campos ainda não promovidos

ParticipantFeatures / TeamFeatures
  matchId, sujeito, horizon/window, metricVersion
  valores, denominadores, elegibilidade, qualidade/cobertura
```

Frames podem continuar em arrays/JSON separados, se esse for o padrão de leitura; o requisito é preservar timestamps e os campos necessários, não obrigatoriamente criar uma linha por frame no SQL. Eventos devem ter identidade baseada na ordem de origem, porque timestamps podem coincidir. `killerId=0` e campos ausentes precisam ser representáveis sem inventar jogador.

Separar `teamObjectives` (totais finais) de `objectiveEvents` (sequência temporal). Guardar o time dono da estrutura e o time beneficiário de sua queda elimina a ambiguidade atual. A normalização deve preservar o valor original para auditoria.

Os payloads brutos, comprimidos e com retenção definida, permitem reprocessar métricas novas sem consumir novamente cota da Riot. Os dois arquivos formatados somam 2.601.625 bytes; esse é o tamanho desta amostra, não uma previsão de armazenamento de produção. Para retenção em escala, medir compressão/tamanho real e considerar armazenamento de objetos separado das tabelas de consulta.

Toda agregação histórica deve acumular somas e denominadores de observações válidas. Se uma partida termina antes dos 15, CSD@15 deve ficar ausente e não entrar no denominador. Mudança de definição deve gerar nova `metricVersion` e um caminho de reconstrução, sem somar a mesma partida duas vezes.

## 10. Ordem recomendada e critério de conclusão

1. **Qualidade e retenção:** corrigir wards indefinidas, persistência dos objetivos, timestamp/identidade dos eventos e inventário final. Preservar campos necessários antes de ampliar a ingestão.
2. **Métricas explicáveis:** visão colocada/removida por fase, KP, damage/gold share, estruturas, cura/escudo, tempo morto e checkpoints. Reconciliar cada família com o resumo.
3. **Contexto temporal:** objetivos após abates, mortes próximas a objetivos, trocas de estruturas, curvas de vantagem e economia antes/depois. Expor parâmetros e limites dos proxies.
4. **Histórico:** referências por posição/campeão e estudo de visão/vitória com deduplicação, elegibilidade, incerteza e avaliação temporal.

O script passou 100 conferências jogador a jogador entre resumo e timeline (kills, deaths, assists, wards colocadas/removidas/control, solo kills, ouro final, CS final e dano final) e 12 conferências de objetivos por time. Também verificou correspondência de IDs, participantes e vencedor. Isso valida os exemplos numéricos desta amostra; não valida generalização para outros patches ou todas as hipóteses do catálogo.

Os cálculos numéricos do relatório são rastreáveis ao JSON gerado. A aplicação de produção e seus testes não foram executados nem alterados. Os artefatos adicionados são uma análise offline, um inventário, resultados reproduzíveis e esta proposta de métricas.
