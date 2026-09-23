# Comparações H01/H02 — MET-08

As rotas existentes `GET /api/v1/analytics/compare`, `/api/v1/matches/:matchId/performance/:puuid` e os históricos de partidas deixam de preencher dados ausentes com zeros. `metricVersion: 1` identifica as duas comparações corrigidas. MET-08 não alterou persistência; a evolução posterior MET-03 adicionou as projeções e o rebuild necessários para a fonte temporal atual, sem mudar a fórmula das comparações.

## Coorte única

Cada jogador possui sua própria amostra, mas resumo, lane e timeline desse jogador usam **exatamente os mesmos matchIds**. Não é exigido que os dois jogadores tenham jogado juntos. Parâmetros: `championId`, `role` (MID e MIDDLE equivalentes), `patch` interno major.minor exato (16.2 não inclui 16.20; ALL inclui todos), `queueId` (420 padrão), `startDate` inclusivo e `endDate` exclusivo em Unix ms, `limit` de 1 a 100 (padrão 100). Mapa 11. As partidas são descritas incluindo remakes; não se afirma elegibilidade para análises históricas que excluam remake. Não há interpretação de patch público nem uso de desafios dependentes de patch.

A consulta filtra antes de limitar e ordena `gameCreation DESC, matchId ASC`. A chave composta de participante garante uma linha por matchId/puuid. Count e seleção usam uma transação RepeatableRead por jogador. `cohort` publica filtros efetivos, ordem, IDs, `eligibleN`, `returnedN`, `limit` e `truncated`. Não existe mais mistura entre agregado histórico integral e timeline parcial. Um jogador existente sem partidas no filtro tem gamesPlayed=0, medidas nulas e winner=null; jogador inexistente retorna 404. Período invertido e limite inválido retornam 400.

## Fórmulas, unidades e ausência

- Resumo: winRate = 100 × vitórias/N; KDA e visionScore são médias dos campos finais; CSPM = média por partida de `totalCs/(gameDuration/60)`; DPM e GPM substituem o numerador por dano a campeões e ouro final. Cada partida válida tem o mesmo peso. O N válido de cada medida está em `stats.samples`, junto de totalN, coverage e reason. Sem arredondamento antes da apresentação.
- O CSPM da comparação de partida e do histórico também usa **totalCs**, nunca o último elemento de csGraph. Timeline ausente não elimina um resumo válido. Duração zero ou campo ausente produz null e motivo.
- Lane @15: diferenças jogador menos adversário de CS (minionsKilled + jungleMinionsKilled), totalGold e XP no mesmo frame selecionado. Adversário precisa ter time conhecido 100/200 e posição canônica igual; zero candidatos é missing_opponent, múltiplos é ambiguous_role. Não se escolhe o primeiro. Cada campo tem N próprio em `laningPhase.samples` e motivos em evidence.fieldReasons.
- Checkpoints de lane e gráficos: nearest de timestamp real, tolerância inclusiva de 60.000 ms, desempate anterior conforme MET-01. @15 alvo 900.000 ms. Os gráficos consultam alvos de minuto inteiro, não índices dos arrays compactos legados. Cada ponto publica validN, totalN, coverage, reason e os matchId/timestampMs/offsetMs contribuintes. A duração define o fim; GAME_END com winningTeam válido pode fornecer o fim mais preciso. Jogo curto, frame ausente, campo ausente e bruto ausente não entram no denominador válido. Campo ausente não é buscado em outro frame.
- MET-13 preenche solo kills/deaths @15 como média por partida válida, com aliases `avgSoloKills15`/`avgSoloDeaths15`, N e evidência por partida; assistência desconhecida não vira zero. Veja [contrato de combate](COMBATE-MET13.md).
- Performance: diferenças absolutas jogador menos adversário. Percentual = 100 × (jogador − adversário)/adversário, com null + zero_denominator se adversário=0. Zero calculado com denominador válido continua zero. `damageTakenPerMinDifference` é uma diferença descritiva de dano recebido/min, sem inferência de sobrevivência. `survivability` foi descontinuado, permanece null com `survivabilityReason=not_a_survivability_measure`.

## Fonte temporal e custo limitado

Resumo e adversários vêm de MatchParticipant. MET-03 substituiu o adaptador transitório de bruto por MatchTimelineProjection, para os mesmos IDs selecionados; nenhum GET descomprime MatchRaw. O limite continua de 100 partidas por jogador. `cohort.timelineSource=MatchTimelineProjection` e timelineReadN explicitam origem/custo. Projeção inexistente produz missing_projection com cobertura temporal zero; a API não reconstrói checkpoints pelos índices legados. Ver [compatibilidade e rebuild de snapshots](SNAPSHOTS-TIMELINE.md). O decodificador de bruto permanece apenas como utilitário offline/teste, fora do caminho HTTP.

## Compatibilidade e exemplo sintético

Os caminhos e nomes centrais são preservados. As correções de nulabilidade, fonte do CSPM, população, checkpoint e precisão são **intencionais**: consumidores devem tratar null como indisponível e formatar casas decimais na apresentação. `survivability` não deve mais alimentar radar/nota. Metadados novos são aditivos. Não se mantém uma rota legada com resultados sabidamente incorretos. O schema OpenAPI declara os campos nulos e descreve os denominadores/evidências.

Exemplo sintético de uma partida válida em duas selecionadas: `stats.gamesPlayed=2`, `laningPhase.samples.cs={value:15,validN:1,totalN:2,coverage:0.5,reason:null}`, `laningPhase.soloKills15=null`, `soloKills15Reason="no_valid_samples"`. Um checkpoint do gráfico pode ser `{minute:15,value:100,validN:1,totalN:2,coverage:0.5,reason:null,evidence:[{matchId:"m1",timestampMs:920000,offsetMs:20000}]}`. O segundo jogo curto permanece no resumo, mas não contribui a @15.

## Validação

Testes cobrem os filtros SQL compartilhados, alias, prefixo de patch exato, período semiaberto, ordenação e snapshot da consulta; médias por partida; CS final divergente da timeline; limites de tempo e GAME_END; fontes ausentes/corrompidas; campos ausentes; denominador zero; oponentes ambíguos/ausentes; cobertura independente por checkpoint; serialização HTTP real com serviço e OpenAPI. `comparison-contract.e2e-spec.ts` usa dados sintéticos explícitos. `test/integration/comparison.integration-spec.ts` verifica em PostgreSQL real os filtros antes do limite, desempate de ordenação, N/truncamento e ausência de bruto; execução serial fica a cargo do coordenador. Ensaios de custo permanecem em MET-33. Testes unitários de repositório verificam a consulta, não alegam execução de SQL real.
