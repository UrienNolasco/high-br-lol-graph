# Estatísticas finais e contexto — MET-05

As oportunidades V03/C03/C04/C05/C06/O03/E02/E10/B06 passam a ter projeções literais do resumo Match-V5, disponíveis em `GET /api/v1/matches/:matchId`. A partida e o participante continuam identificados por matchId/PUUID. O JSON completo original permanece comprimido em MatchRaw e não é sobrescrito pelas projeções.

## Contrato da projeção

- `MatchParticipant.finalStats`: `projectionVersion=1`, caminho `source`, `origin=observed`, objeto `values`, `missingReasons` e `quality`. Cada chave do catálogo existe em values, com número/booleano ou null. O catálogo executável de unidades é `FINAL_STAT_UNITS` e as flags são `FINAL_FLAG_FIELDS`, em `src/core/riot/final-stats.ts`.
- `MatchTeam.finalObjectives`: totais finais em `values.<tipo>.{first,kills,lost}`, com null para campo/tipo ausente. `objectivesTimeline` guarda exclusivamente eventos e não substitui os totais. Tipos conhecidos: atakhan/baron/champion/dragon/horde/inhibitor/riftHerald/tower. Tipos futuros preservam nome e campos finais reconhecidos e aparecem em unknownTypes; o bruto conserva o restante do payload.
- `Match.finalContext`: gameStartTimestamp/gameEndTimestamp em epoch ms, gameId, platformId, gameType, endOfGameResult e tournamentCode. São campos observados do resumo; gameDuration continua em segundos e gameCreation mantém a conversão legada BigInt→string. Código de torneio vazio presente é preservado como string vazia.
- `riotIdGameName` e `riotIdTagline`: colunas nullable, sem substituir PUUID. `displayName` prioriza `gameName#tagLine`; quando só gameName existe, usa esse nome; depois recorre a summonerName e finalmente PUUID. `displayNameSource` identifica a origem e `riotIdReason=missing_field` explica Riot ID incompleto. summonerName permanece como compatibilidade.

As projeções não calculam razões, notas ou taxas: não há denominador estatístico para um contador final observado. `quality.validFields / quality.totalFields` mede apenas presença/validade dos campos do catálogo (fração 0–1), nunca completude temporal ou qualidade da atuação. Em objetivos, cada tipo tem três campos esperados; os `lost` ausentes da fixture continuam null e entram como ausentes na cobertura. Isso não invalida os kills/first disponíveis.

Null tem motivo: `missing_field` para campo ausente/null; `invalid_value` para tipo incompatível, NaN, infinito ou número negativo. Não se convertem strings em números nem 0/1 em flags. Zero e false válidos são preservados. `origin=observed` descreve a fonte da projeção; cada campo null está indisponível conforme seu motivo. A resposta legada mantém seu formato e adiciona estes objetos; não é o envelope analítico de MET-17.

Colunas novas são nullable, sem defaults inventados. Antes do rebuild, finalStats/finalObjectives/finalContext podem ser null; a rota publica o respectivo `*Reason=not_calculated`. Após processamento, mesmo uma família inteiramente ausente tem objeto com campos null, motivos e cobertura 0, diferenciando “processado sem dado” de “ainda não projetado”.

## Famílias e unidades

| Família / oportunidades | Campos promovidos | Unidade e interpretação |
| --- | --- | --- |
| Visão V03 | wardsPlaced, wardsKilled, detectorWardsPlaced, visionWardsBoughtInGame, sightWardsBoughtInGame, visionScore | Contagens separadas; visionScore em pontos. Compra, colocação e remoção não são intercambiáveis. |
| Dano C03/O03 | total/physical/magic/trueDamageDealt, equivalentes ToChampions e Taken, damageSelfMitigated, damageDealtToBuildings/Objectives/Turrets/EpicMonsters | Pontos de dano, por alvo/tipo; não somar grupos sobrepostos. |
| Cura/escudo C04/C05 | totalHeal, totalHealsOnTeammates, totalDamageShieldedOnTeammates, totalUnitsHealed | Pontos de vida, pontos de dano escudado e contagem de unidades; cura total não vira cura aliada. |
| CC/tempo C06 | timeCCingOthers, totalTimeCCDealt, totalTimeSpentDead, timePlayed, longestTimeSpentLiving | Segundos observados, preservados separadamente. Razões futuras devem escolher explicitamente timePlayed/duração. |
| Recursos E02/E10 | totalMinionsKilled, neutralMinionsKilled, totalAllyJungleMinionsKilled, totalEnemyJungleMinionsKilled, goldEarned, goldSpent, champExperience, champLevel | CS separado lane/jungle, ouro, XP e nível. Não presumir igualdade entre subcontagens de jungle e neutralMinionsKilled. |
| Casts B06 | spell1/2/3/4Casts, summoner1/2Casts | Contagens finais, sem timestamps, cooldowns ou avaliação de execução. |
| Objetivos O03 | baronKills, dragonKills, turretKills/Takedowns, inhibitorKills/Takedowns, nexusKills/Takedowns, objectivesStolen/Assists; totais por MatchTeam | Contagens individuais e de time distintas da sequência temporal de eventos. |
| Contexto | gameEndedInSurrender, gameEndedInEarlySurrender, teamEarlySurrendered | Flags por participante; não inferem remake por duração nem criam consenso de time quando ausentes/divergentes. |

Não existe campo currentGold/goldBalance derivado de `goldEarned-goldSpent`. Esses são contadores diferentes e não representam saldo final. Saldo observado requer snapshot com currentGold, tratado por MET-03.

Os campos novos usam a partida solicitada inteira, sem filtro adicional de fila, campeão, papel ou resultado. Finais são observações do resumo pós-jogo; não podem ser usados como features disponíveis em um checkpoint anterior. Não se inventa timestamp individual de cada contador. Este contrato preserva o que o payload contém em qualquer versão, mas a reconciliação real disponível cobre somente BR1_3200579475, patch interno 16.2, fila 420, mapa 11; outras versões não têm validação semântica generalizada.

## Exemplo e reconciliação

Trecho de participante da fixture, mantida a identidade PUUID: `displayName=naul#001`, `finalStats.values.timePlayed=2368`, `totalTimeSpentDead=212`, `wardsPlaced=13`, `wardsKilled=4`, `detectorWardsPlaced=0`, `gameEndedInSurrender=true` e `gameEndedInEarlySurrender=false`. Milio conserva 19.049 em totalDamageShieldedOnTeammates; o dano a torres de Fiora representa aproximadamente 79,14% do total do seu time (conferência da fixture, não nova métrica desta rota).

Uma variação sintética que remove totalHealsOnTeammates retorna null com missing_field; totalDamageShieldedOnTeammates=0 e gameEndedInSurrender=false continuam valores válidos. Objetivo ausente retorna null, nunca kills=0 por omissão. Schema OpenAPI documenta numerais/flags nullable, campos de origem/cobertura e os finais separados da timeline.

A reconciliação reproduzível compara todos os campos promovidos para cada um dos dez participantes e first/kills dos dois times:

```sh
npm run build
node scripts/validate-final-stats.cjs
```

Resultado em [analysis/met05-final-stats-reconciliation.json](analysis/met05-final-stats-reconciliation.json), incluindo unidades, N por participante e falhas. O script usa somente a fixture local e não faz rede/banco.

## Migration e reconstrução

`20260923030000_met05` adiciona cinco colunas nullable: finalContext, riotIdGameName, riotIdTagline, finalStats e finalObjectives. Não faz backfill inferido; MatchRaw continua a fonte para reconstrução. PROCESSING_VERSION=2 é a geração conjunta da fundação MET-03/04/05/06; cada projeção final tem projectionVersion=1. Reentrega de job COMPLETED não preenche as novas colunas: é necessário o rebuild offline transacional descrito em [PROCESSAMENTO-CONFIAVEL.md](PROCESSAMENTO-CONFIAVEL.md).

As projeções entram no mesmo commit de partida/participantes/times/agregados do worker. A timeline de objetivos é gravada a partir dos eventos; finalObjectives entra separadamente a partir do resumo. Falha parcial reverte as projeções junto aos agregados, preservando o bruto. Rebuild repetido deve produzir projeções/agregados iguais sem duplicação. Ao voltar o código anterior, conservar as colunas e MatchRaw; não executar downgrade destrutivo como rollback da aplicação. Nenhuma execução em produção está incluída nesta task.

## Validação

Testes puros cobrem reconciliação dos dez participantes, zero/false versus ausência, campos inválidos, tipos futuros de objetivos, precisão numérica, timestamps e fallback de Riot ID. HTTP usa controller/serviço/repositório reais com apenas Prisma substituído e verifica serialização e OpenAPI. Integração usa PostgreSQL/RabbitMQ descartáveis, confere round-trip de todos os finais, JSON bruto intacto, opcionais ausentes e dois rebuilds reproduzindo projeções e agregados.


Validação local antes do ensaio PostgreSQL: build e Prisma validate aprovados; 285 testes unitários em 57 suítes e 64 testes HTTP em 11 suítes aprovados. A conferência offline reproduziu 590 campos de participantes (59×10) e 32 campos first/kills de objetivos, sem falhas. Campos básicos obrigatórios do pipeline continuam sujeitos à validação existente; a nulabilidade dos opcionais não relaxa a integridade mínima necessária ao processamento.


Ensaio isolado da migration e integração executado pelo coordenador sobre esta worktree: os dados existentes nas oito tabelas auditadas conservaram as mesmas contagens/fingerprints (excluindo apenas as cinco colunas novas da comparação). As duas suítes PostgreSQL/RabbitMQ passaram: 26 testes em 44,799 s. O cenário MET-05 conferiu round-trip dos dez participantes e times, ausência sintética, bruto intacto e duas reconstruções reproduzindo finais/agregados. Evidência: [analysis/met05-migration-validation.json](analysis/met05-migration-validation.json). Esses resultados são do banco descartável; não constituem ensaio em produção.
