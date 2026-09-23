# Objetivos, placas e estruturas — MET-14

`GET /api/v1/matches/:matchId/objectives` entrega O01/O02/O03/O04. `calculateObjectives` é a função pura e `MatchObjectivesService` é exportado para composição de relatórios. O GET consulta apenas Match, MatchParticipant.finalStats, MatchTeam.finalObjectives, MatchEventProjection e MatchProcessing, em snapshot RepeatableRead. Não lê MatchRaw, não descomprime payload bruto nem consulta rede.

## Proveniência e ausência

A resposta usa metricVersion=1 e processingVersion/processedAt reais do job concluído. Sem esses metadados, `report=null, reason=not_calculated`; nenhuma data é fabricada. Geração anterior à fundação de eventos (2), gerações mistas, versão de evento desconhecida ou matchId incoerente produzem unsupported_version global. Identidade de evento duplicada produz invalid_value, sem deduplicação silenciosa. Match inexistente retorna 404.

A identidade é `matchId:frameIndex:eventIndex`, preservando eventos distintos com mesmo timestamp. A cronologia ordena por timestamp, depois índices de origem; timestamp ausente vai ao fim e não recebe fase inventada. Cada item mostra evidência, qualidade normalizada, versão, autor/assistentes, IDs fonte, posição, lane/tier, dono e beneficiário. `killerId=0` permanece no campo literal sourceKillerId, com actorPuuid null; não é jogador. Lista de assistentes ausente é null, distinta de lista explicitamente vazia. Participantes não resolvidos continuam null. Alma com teamId=0 continua sem beneficiário; não se usa o vencedor para preenchê-lo.

Contagens de eventos exigem exatamente um GAME_END válido e todos os eventos selecionados com timestamps no intervalo fechado [0,GAME_END]. Sem terminal ou com tempo inválido/fora do fim, a cronologia é preservada, mas agregados recebem unavailable/missing_frame. Totais finais e dano observados continuam legíveis. `coverage.completeTimeline` significa essa verificação sobre a projeção confirmada pelo job; não prova que a Riot forneceu eventos que nunca foram registrados. A completude de ingestão é responsabilidade de MET-04/MET-09. Zero é contado somente quando a projeção tem esse contrato válido.

## O01: cronologia e reconciliação

FinalTotals expõe os objetivos finais, sem misturá-los às contagens da timeline. Kills é MetricResult observed, em count, com unidade/qualidade/evidência e ausência explícita; first/lost são booleanos nullable com motivos separados. Tipos futuros nos totais finais são preservados. Fonte antiga/ausente não vira zero. Em mapId11, time100/200 ausente recebe totais unavailable, preservando as duas populações esperadas.

As 12 conferências são seis categorias × dois times: dragon/DRAGON, baron/BARON_NASHOR, horde/HORDE, riftHerald/RIFTHERALD, tower/TOWER_BUILDING, inhibitor/INHIBITOR_BUILDING. O contador derivado é o número de identidades de evento da categoria cujo beneficiaryTeamId corresponde ao time. ELITE_MONSTER_KILL usa o beneficiário normalizado de killerTeamId; BUILDING_KILL separa ownerTeamId (estrutura destruída) de beneficiaryTeamId. Autor não substitui beneficiário ausente.

`difference=timelineCount-finalCount`; matches/difference são null quando um operando é indisponível. Divergência não é corrigida escondendo uma fonte: gera reconciliationIssues no contador de eventos. Tipo desconhecido da família impede reconciliação (unsupported_version), e beneficiário ausente de uma categoria impede suas conferências (missing_field). Alma é evento separado de captura de dragão. Atakhan e objetivos finais champion são preservados, mas não são adicionados artificialmente às 12 conferências.

## O02/O03: contribuição, last hit e dano

Por participante e categoria, registeredEvents contém lastHits e participations. LastHits conta somente eventos que nomeiam explicitamente o participante como autor. Participations conta a união autor OU assistente, uma vez por identidade, inclusive com assistente repetido. São registros observados transformados em contagem derivada, **limite inferior da presença**, nunca todos os jogadores presentes. unknownActors/missingAssistantLists e quality mostram a cobertura: lastHits usa autores conhecidos/eventos; participations usa campos conhecidos de autor e lista de assistentes/2×eventos. Ausência não vira autoria de alguém.

TurretKills (últimos golpes finais), turretTakedowns (participação final) e damageDealtToTurrets são observações diferentes. Dano em estruturas, objetivos e épicos também fica em campos separados; não é somado como um número de objetivos. Nenhum deles é usado como substituto de participação espacial ou de evento.

TurretDamageShare = 100 × dano em torres do participante / soma do dano em torres dos cinco integrantes distintos do time. Unidade percent (0–100), denominador explícito damage, sem arredondamento/clipping. Roster/mapa não suportado, qualquer campo ausente, número inválido/overflow ou denominador zero produzem ausência com motivo. A qualidade conta campos válidos entre os cinco esperados. Não soma dano desconhecido como zero. O dano final não possui atribuição por lane/fase; os agrupamentos temporais descrevem eventos de estrutura, não uma estimativa de dano distribuído entre lanes.

## O04: placas por lane/fase/time

Todas as placas são preservadas. As fases são bins descritivos: early [0,14min), mid [14min,25min), late [25min,GAME_END]. Limites dos grupos são explícitos em MetricResult.window e respeitam o fim da partida. Estes bins não declaram uma regra de validade de placas: não há corte universal aos 14 minutos. A fixture 16.2 comprova eventos posteriores a esse instante.

Grupos de placas e estruturas usam beneficiário, dono, lane, tier e fase; categorias null são preservadas. A fórmula é contagem de identidades distintas com esses atributos, unidade count, sem denominador. Evidências ligam cada contagem aos eventos. Não se atribui recompensa inteira ao último golpe, nem se estima ouro por placa. Posição não implica presença de todos os participantes.

## Evidência reproduzível

```sh
npm run build
node scripts/validate-objectives.cjs
npm test -- --runInBand objectives-calculator
npm run test:e2e -- --runInBand objectives-contract
```

[analysis/met14-objectives-examples.json](analysis/met14-objectives-examples.json) registra as 12 conferências, 13 torres, 2 inibidores, 74 placas, 28 killerId=0 e alma sem time. Inclui evidência de estrutura e dano de Fiora (~79,14%). Os metadados desse arquivo offline são explicitamente sintéticos; o endpoint lê os reais. A validação real disponível é de uma partida 16.2/420/11; não se alega representatividade de todos os patches.

Testes cobrem autor+assistente sem dupla contagem, zero/ausência nos denominadores, roster parcial, projeção desconhecida, gerações mistas, identidade duplicada, terminal/tempo ausente, limites de fase/fim do jogo, categoria futura, beneficiário desconhecido, overflow e reconciliação divergente. HTTP atravessa controller/serviço/função reais com apenas Prisma substituído, verificando isolamento, consulta somente a projeções, 404, ausência e OpenAPI. Não há nova persistência, migração, alteração de PROCESSING_VERSION ou rebuild nesta tarefa de leitura; as fontes foram persistidas e ensaiadas por MET-04/MET-05/MET-09.

Validação desta entrega sobre a base 0f14987: build aprovado; 308 testes unitários (64 suítes) e 76 HTTP (15 suítes) aprovados. O reconciliador offline passou nas 12 conferências, sem divergências, e preservou as 60 placas aos 14 minutos ou depois. Nenhum banco foi acessado nesta tarefa.
