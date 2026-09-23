# Contribuição individual por dimensão — MET-10

`GET /api/v1/matches/:matchId/contribution/:puuid` expõe recursos, combate, visão e estruturas de um participante. A função pura `computeContribution` e `MatchContributionService` são reutilizáveis pela composição do relatório MET-17. Nenhuma dimensão é transformada em score universal, rótulo de culpa ou classificação de quem carregou.

## Fontes e contrato

A rota lê apenas campos de MatchParticipant (finalStats, kills, assists, identidade/papel) e metadados de Match/MatchProcessing em um snapshot RepeatableRead. Não acessa MatchRaw, não descomprime payloads nem consulta Riot/Data Dragon. O consumo é limitado à partida solicitada e à lista de campos selecionados. Não há filtro implícito por campeão, papel, fila ou resultado.

Cada valor é `MetricResult` de MET-01: metricId do catálogo, metricVersion=1, processingVersion e processedAt reais do job concluído, sujeito, unidade, denominador explícito, qualidade, evidência, origem e motivo. Valores diretos são observed, somas/razões são derived e ausências são unavailable. A janela é null: são totais finais descritivos, não features disponíveis em um instante anterior. O processamento original concluiu as projeções em processedAt; o GET não inventa esse timestamp com o relógio da requisição.

Match ou participante inexistente retorna 404. Sem job concluído com geração/data rastreáveis, retorna 200 com `dimensions=null, reason=not_calculated` e metadados conhecidos/null. Com metadados rastreáveis e finalStats ausente, os valores afetados ficam unavailable/not_calculated; KP ainda pode usar os contadores nativos válidos. Versão desconhecida de finalStats produz unsupported_version. As quatro dimensões continuam disponíveis para renderizar cobertura parcial.

Os motivos missing_field/invalid_value identificam campos ausentes/inválidos; zero_denominator é usado para divisão por zero; insuficiência de roster usa insufficient_sample; identidade duplicada/roster excedente usa invalid_value. Nenhum cálculo soma ausência como ouro, dano ou tempo zero. Zero observado e resultado derivado zero válido são preservados. O cálculo não arredonda.

## População e cobertura

Somas/shares exigem os cinco participantes distintos do mesmo teamId conhecido (100/200), mapId 11, e todos os campos pertinentes válidos. Em mapa sem contrato de roster validado, os totais individuais literais continuam disponíveis, mas shares/somas de time ficam unsupported_version. Não se reduz o denominador silenciosamente a quatro jogadores nem se inclui o time adversário.

`quality.validSamples/totalSamples` conta campos fonte necessários, removendo duplicatas de evidência entre numerador e denominador. Slots de integrantes ausentes continuam no número esperado. Exemplo: damage share com um dano de colega ausente tem 4/5 campos válidos; KP usa cinco kills e o assist do participante, sem contar o kill próprio duas vezes. CS exige os dois componentes de cada integrante. Esses N são cobertura de operandos, não tamanho de uma coorte histórica. Zero no denominador pode ter cobertura completa e ainda resultar unavailable.

## Fórmulas

`measure` contém absolute, perMinute e teamShare. Todas as taxas da rota nova usam `value / timePlayed_seconds * 60`; não usam duração do último índice da timeline. Shares usam `100 * value / sum(team value)` e representam percentuais 0–100, sem clipping artificial. A razão entre shares é adimensional. Denominadores zero/ausentes deixam o resultado null com motivo e evidências.

| Dimensão / ID | Medidas e fontes | Fórmula específica / limites |
| --- | --- | --- |
| Recursos E04 | Ouro e CS lane+jungle | Ouro = goldEarned; CS = totalMinionsKilled + neutralMinionsKilled, somente com ambos presentes. Ouro não é goldEarned−goldSpent. |
| Recursos E04 | Concentração de ouro | 100*maior ouro individual/soma do time. largestGoldHolders contém todos os PUUIDs empatados, em ordem estável; vazio com total ausente/zero. Descreve distribuição, não justiça. |
| Combate C01 | Kills, assists e KP | 100*(kills+assists)/sum(team kills). KP não usa soma de assistências como denominador. |
| Combate C02 | Dano a campeões e relação dano/ouro | damage share = 100*totalDamageDealtToChampions/soma do time; razão = damageShare/goldShare. Participação de ouro individual zero também torna a razão indisponível. Não é eficiência universal entre papéis. |
| Combate C03 | Dano físico/mágico/verdadeiro causado e recebido | Absolutos por tipo; composição = 100*tipo/total do próprio jogador. Dano recebido tem absoluto/taxa/share e não é uma nota de sobrevivência ou mau desempenho. |
| Combate C04 | Cura e escudo aliados | Usa somente totalHealsOnTeammates e totalDamageShieldedOnTeammates. totalHeal não entra em cura aliada, mesmo quando é maior. |
| Combate C05 | Controle de grupo | timeCCingOthers, em segundos. Não soma totalTimeCCDealt, que tem outro significado. |
| Combate C06 | Tempo morto individual | totalTimeSpentDead (segundos), e 100*totalTimeSpentDead/timePlayed. Zero timePlayed não vira 0%. |
| Combate C06 | Tempo morto do time | sum(dead time) e sum(timePlayed), ambos em jogador-segundos; percentual = 100*sum(dead)/sum(timePlayed). Não dividir a soma pelo tempo de um único jogador nem multiplicar uma duração presumida por cinco. |
| Visão V04 | visionScore, wardsPlaced e wardsKilled | Cada contador tem absoluto/taxa/share próprios. Score, colocação e remoção não são intercambiáveis nem provam visão de uma região. |
| Estruturas O03 | Dano em torres, turretKills e turretTakedowns | Dano a torres tem absoluto/taxa/share. Último golpe e participação registrada são contadores separados; não se somam como torres distintas. |

Unidades adicionais no contrato comum: health, health_per_minute, count_per_minute e seconds_per_minute. Cura usa pontos de vida; escudo usa pontos de dano escudado. Ouro, dano, CS, score, segundos e jogador-segundos mantêm as unidades nomeadas de MET-01.

## Contexto de papel e compatibilidade

A resposta inclui papel canônico (MID→MIDDLE) e explicação de leitura por papel. UTILITY destaca cura, escudos, controle de grupo e visão. Papel desconhecido permanece null e recebe contexto genérico; nunca vira TOP. As explicações não comparam numericamente jogadores de campeões/papéis diferentes nem inferem intenção.

A rota existente `performance/:puuid` permanece com o contrato MET-08, inclusive suas taxas legadas por gameDuration e a retirada do rótulo survivability. A rota nova publica explicitamente timePlayed em cada denominador; diferenças entre durações não são escondidas. Não houve alteração de projeções, migration ou PROCESSING_VERSION nesta task.

## Exemplos e verificação

Na fixture BR1_3200579475, Fiora tem aproximadamente 79,14% do dano a torres do seu time, e Milio preserva 19.049 de escudo aliado. A resposta mostra unidades, valores dos denominadores e campos fonte dos cinco integrantes, sem transformar esses números em nota única. Os dados reais disponíveis são de uma partida 16.2/420/11; não há alegação de validação semântica de todos os patches.

```sh
npm run build
node scripts/validate-contribution.cjs
npm test -- --runInBand contribution match.repository
npm run test:e2e -- --runInBand contribution.e2e-spec
```

[analysis/met10-contribution-examples.json](analysis/met10-contribution-examples.json) contém trechos executáveis de Fiora/Milio e uma variação explicitamente sintética com denominador zero. Os metadados de processamento desse exemplo offline são sintéticos e identificados; na API são lidos do banco. O script confere quatro fórmulas para cada um dos dez participantes contra o resumo original.

Testes cobrem shares/KP/razão com zero e ausências, composição, cura própria excluída, tempos individuais distintos, jogador-segundos, roster parcial/duplicado, tipo de mapa/projeção desconhecido, overflow, empates e MID. HTTP atravessa controller/repositório/serviço/cálculo reais com apenas Prisma substituído e verifica 404, indisponibilidade, cobertura parcial e OpenAPI. Não há nova persistência a migrar/reconstruir: MET-05/MET-09 validam as projeções consumidas.

Validação desta entrega: build aprovado; 321 testes unitários (63 suítes) e 70 HTTP (13 suítes) aprovados. Após explicitar a obrigatoriedade de subject/window/denominator/quality no OpenAPI compartilhado, os 13 testes direcionados de contrato/cálculo/serviço e toda a suíte HTTP passaram novamente. O reconciliador offline verificou 40 fórmulas em 10 participantes, sem divergências; Fiora=79,1386420880733% e Milio=19049. Não foi necessário acesso ao banco nem reconstrução nesta tarefa de leitura.
