# Bounties e roubos registrados — MET-30

`GET /api/v1/matches/:matchId/bounties-steals` expõe O10/O11: anúncio/início/fim de objective bounty, observações literais de bounty/shutdown e contadores independentes de roubos, assistências, proximidade e timing. Nenhum desses registros prova catch-up, valor perdido, intenção, todas as contestações ou tentativas falhadas. Não há taxa de sucesso sem denominador observável.

## Fontes, versões e ausência

`MatchBountiesStealsService` consulta Match, MatchParticipant.finalStats/challenges, MatchEventProjection e MatchProcessing em transação RepeatableRead. O serviço é exportado para relatórios. O GET não lê/descomprime MatchRaw nem acessa Riot/Data Dragon. As associações de objetivos usam as identidades e o beneficiário de MET-04/MET-14, incluindo owner/beneficiary separados nas estruturas.

A definição de cálculo e o catálogo de challenges são versão 1; aceitam projeções de eventos/finalStats versão 1, produzidas por geração de processamento≥2. processingVersion/processedAt são os do job COMPLETED, nunca fabricados pelo GET. Sem proveniência, report=null/missing_projection; geração incompatível/mista ou identidade de outra partida produz unsupported_version; identidade duplicada, invalid_value. Partida inexistente retorna 404.

O contrato informa gameVersion, fixtureValidatedPatch=16.2 e currentPatchFixtureValidated. Fora do patch validado, campos opcionais continuam expostos como literais do mesmo nome/tipo, com crossPatchPolicy explícita: não se deduz atraso de ativação, fórmula de prêmio ou semântica de contestação específica daquele patch. Isto não é garantia de equivalência entre patches nem autorização de comparação histórica direta. Tipos desconhecidos de finalStats permanecem indisponíveis, sem reutilizar seus valores como versão 1.

Contadores exigem inteiros finitos não negativos; valores de ouro permitem fração finita não negativa. Zero observado é válido; campo ausente, inválido ou projeção ausente tem value=null, motivo, evidência e cobertura. Nenhum campo ausente vira zero. Todos os valores usam MetricResult de MET-01. Booleanos de censura/metadados e IDs fonte acompanham cada intervalo.

## O10 — anúncio, início, fim e censura

`announcementTimestampMs` é o timestamp do PRESTART. Quando `actualStartTime` numérico válido é fornecido, ele prevalece como startMs, sem arredondamento nem aplicação de atraso fixo do patch. Se o campo está ausente/null, usa-se o timestamp do anúncio apenas como fallback **estimated**, exposto em startSource=announcement_timestamp. Valor fornecido inválido não autoriza fallback: início/duração ficam indisponíveis. O horário literal do anúncio permanece visível.

Os limites são percorridos por timestamp e índices de origem. FINISH só fecha uma única PRESTART anterior ainda pendente do mesmo time 100/200 conhecido. Não se infere time pelo vencedor, déficit de ouro, ator de outro evento ou posição. Dois anúncios pendentes do mesmo time tornam o fim ambíguo: nenhum é escolhido; os registros recebem invalid_value/issues e o FINISH órfão é preservado. Identidades distintas com o mesmo timestamp continuam distintas. Um FINISH não é consumido por duas janelas. A ambiguidade anterior permanece pendente: um anúncio novo não autoriza atribuir um FINISH posterior como se os anteriores estivessem comprovadamente encerrados.

`endMs` contém somente timestamp de FINISH registrado. Sem FINISH, censoredEnd=true e endMs=null. Havendo exatamente um GAME_END válido, observedEndMs marca esse limite de observação; sem ele, permanece null/missing_frame. O GAME_END jamais é inventado como FINISH. A evidência do terminal acompanha durações censuradas. FINISH sem início produz censoredStart=true/startMs=null. PRESTART e FINISH de time desconhecido não são pareados nem entre si: não se sabe se tratam do mesmo time.

`observedDuration = observedEndMs − startMs`, unidade milliseconds, denominador null. É derived quando os limites usados são literais; fallback do anúncio é estimated. Em censura, descreve somente o trecho observado, não a duração total desconhecida. Intervalo fechado por FINISH usa [start,end); corte por fim do jogo usa [start,observedEnd]. Duração zero é válida. Fim anterior ao início ou eventos além do término observado são invalid_value, sem duração negativa ou corte silencioso.

Objetivos/estruturas registrados dentro do intervalo e com beneficiaryTeamId correspondente aparecem como associatedObjectiveEventIds/count. A fórmula é contagem das identidades ELITE_MONSTER_KILL/BUILDING_KILL dentro dos limites; não é classificação de elegibilidade para bounty. Timestamp/beneficiário relevante ausente impede uma contagem completa. Time desconhecido não recebe objetivos por aproximação. Essa é **associação temporal**, não prova de bônus recebido, roubo ou efeito sobre o resultado. A qualidade conta os limites/time e operandos temporais/de atribuição necessários. Sem término conhecido, coverage informa ausência; janelas fechadas por FINISH podem continuar documentando seus próprios limites observados.

## Campos literais de bounty

literalRewards conserva bounty e shutdownBounty separados em cada CHAMPION_KILL/ELITE_MONSTER_KILL/BUILDING_KILL, com timestamp, identidade, autor nullable, killerId literal, sourceTeamId e owner/beneficiary. Campos de CHAMPION_KILL mantêm referência C08 de MET-13; os objetivos usam O10. O contador separado challenges.bountyGold também referencia C08. Não são somados, tratados como prêmio total ou distribuídos aos assistentes. killerId=0 não é jogador; valor literal válido pode existir sem autor conhecido, e a qualidade da autoria fica explícita.

O challenge bountyGold também é uma observação independente, com precisão original. Não é somado a bounty/shutdown nem reconciliado à força com esses campos, cujas semânticas não foram validadas como parcelas disjuntas. Não há valor de oportunidade perdido, valor esperado ou recomendação de caça a bounty.

## O11 — registros independentes

| Fonte | Campo | Unidade / categoria |
|---|---|---|
| finalStats versão 1 | objectivesStolen | count, roubos finais registrados |
| finalStats versão 1 | objectivesStolenAssists | count, assistências finais registradas |
| challenges | epicMonsterSteals | count, steals |
| challenges | epicMonsterStolenWithoutSmite | count, steals_without_smite |
| challenges | epicMonsterKillsNearEnemyJungler | count, proximity |
| challenges | junglerTakedownsNearDamagedEpicMonster | count, proximity |
| challenges | epicMonsterKillsWithin30SecondsOfSpawn | count, spawn_timing |
| challenges | bountyGold | gold, literal separado em O10 |

Os campos são opcionais por participante/versão. As categorias organizam nomes registrados, sem converter proximidade em tentativa, roubo ou contestação. Não se somam counters similares como fatos distintos, não se exige igualdade entre objectivesStolen e epicMonsterSteals e não se calcula taxa de sucesso. Os totais finais/challenges não fornecem identidade temporal: mesmo um contador positivo não é ligado arbitrariamente a um evento de captura. Não se inventa roubo em um evento porque o jungler adversário aparece próximo.

## Evidência reproduzível

```sh
npm run build
node scripts/validate-bounties-steals.cjs
npm test -- --runInBand bounty-windows bounties-steals
npm run test:e2e -- --runInBand bounties-steals-contract
```

[analysis/met30-bounties-steals-examples.json](analysis/met30-bounties-steals-examples.json) registra a janela da fixture: anúncio 1245318ms, início 1260000ms, fim 1555457ms e duração 295457ms. Karthus tem 2 epicMonsterKillsNearEnemyJungler, enquanto seus roubos finais registrados são 0; um não substitui o outro. A fixture inteira preserva 119 eventos com os dois campos bounty/shutdown separados. Os metadados offline são sintéticos e identificados; há uma cópia sintética sem FINISH para demonstrar censura.

O reconciliador compara 80 campos de participantes e 238 campos de eventos com as fontes originais, incluindo ausências e frações sem arredondamento. Testes cobrem precedência/fallback/valor inválido, dois times intercalados, time desconhecido, anúncios ambíguos, órfãos, censura sem fim do jogo, duração zero/fim inválido, limites inclusivos/exclusivos, ausência diferente de zero, projeção desconhecida e política de patch. HTTP usa controller/serviço/cálculo reais com apenas Prisma substituído, validando seleção de projeções, isolamento, 404, nulabilidade e OpenAPI. Não há migration, mudança de PROCESSING_VERSION nem reconstrução nesta task de leitura; MET-04/MET-05/MET-09 validam a persistência das fontes.

Gates sobre a base db47115: build aprovado, 374 testes unitários em 74 suítes e 91 HTTP em 19 suítes aprovados. Após reforçar a preservação de ambiguidade para limites posteriores, build, reconciliador e 13 testes direcionados passaram novamente, incluindo a regressão adicional. O reconciliador conferiu 80 campos de participantes e 238 campos de eventos, sem divergências. HTTP completo executado pelo coordenador; nenhum banco foi usado nesta tarefa.
