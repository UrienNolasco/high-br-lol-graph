# Corpus de validação e cobertura — MET-02

O corpus disponível contém **uma partida real**, BR1_3200579475, gameVersion `16.2.741.3171`, fila 420, mapa 11. O manifesto `docs/analysis/corpus-manifest.json` aceita pares adicionais de resumo/timeline. Nenhuma amostra real de outros patches foi encontrada entre os fixtures registrados. A matriz não declara suporte geral ao patch, a modalidades diferentes ou à população BR.

## Reprodução

```sh
python3 scripts/analyze-example-match.py
python3 -m unittest discover -s scripts -p 'test_metrics_corpus.py' -v
python3 scripts/audit-metrics-corpus.py
```

O auditor original continua disponível para exploração detalhada; o novo auditor compara diretamente os dois JSONs de origem, sem ler o relatório anterior ou resultados do parser como verdade esperada. SHA-256 dos arquivos e entradas do manifesto fazem parte do relatório determinístico `docs/analysis/corpus-audit.json`. O comando retorna código 1 diante de divergências reais/integridade ou cenário sintético que não apresente a resposta esperada. Campos ausentes são registrados como indisponíveis, sem alegar que houve conferência válida.

Para reproduzir o relatório anexado incluindo a medição já coletada do banco isolado:

```sh
python3 scripts/audit-metrics-corpus.py --match-raw-evidence docs/analysis/match-raw-local-evidence.json
```

Para medir novamente, apenas se o container dedicado dos testes estiver disponível:

```sh
python3 scripts/measure-match-raw-local.py --output /tmp/match-raw-local-evidence.json
python3 scripts/audit-metrics-corpus.py --match-raw-evidence /tmp/match-raw-local-evidence.json --output /tmp/corpus-audit.json
```

A consulta é um SELECT no container fixo `high-br-reliability-postgres`, banco `high_br_integration`. Não lê DATABASE_URL, não conecta à produção, não altera tabelas nem executa integração/reset. Se o banco não estiver disponível, a medição falha explicitamente; o auditor offline sem evidência registra `not_measured`, contagens null e seu limite. Não substituir indisponibilidade por zero.

## Conferências e cobertura

Para cada um dos dez participantes, os dez campos são conferidos entre fontes distintas: kills, deaths, assists, wardsPlaced reconhecidas, wardsKilled, control wards, solo kills sem assistência registrada, ouro final, CS final lane+jungle e dano final a campeões. Cada linha traz expectedSummary, observedTimeline e status pass/fail/unavailable. São **100 conferências individuais válidas sem falhas**.

Para cada time, comparam-se totais de dragon, baron, horde, riftHerald, tower e inhibitor a eventos de captura: **12 conferências sem falhas**. Em BUILDING_KILL, teamId é o dono destruído, portanto o beneficiário é o outro time, incluindo killerId=0. Em ELITE_MONSTER_KILL usa-se killerTeamId; time desconhecido aparece com índices de evidência e não recebe atribuição inventada.

Cobertura observada: 41 frames, 410 snapshots; minuto 39 contém dois frames distintos, 2340765 e 2368922 ms. Todos os timestamps/duplicações ficam disponíveis. Checkpoints nearest/pastOnly seguem a convenção MET-01 (tolerância inclusiva 60 s, sem frame futuro em pastOnly). GAME_END define fim observado quando presente, preservando o frame final além da duração truncada em segundos. Aos 15 minutos nearest seleciona 900358 ms; pastOnly seleciona 840357 ms. Posição original e canônica e adversário único são auditáveis.

Há 196 colocações de wards reconhecidas e 556 de tipo desconhecido. Unknown não é descartado nem contado como ward validada. Tipos futuros de eventos e wards ficam em mapas separados; o catálogo de tipos reconhecidos é da auditoria v1, não promessa de semântica futura. Presença de campos opcionais informa N presente e N total por campo; null é ausência, enquanto zero/false permanecem observados. Reconciliar esse único fixture não valida todos os campos de todos os jogos.

## Variações sintéticas controladas

Cada mutação parte de cópia independente do fixture real, é identificada por sampleId/mutation/derivedFrom e nunca altera os JSONs originais. O relatório real publica todas as conferências; variações publicam somente pares divergentes/indisponíveis, além dos contadores totais. São cenários de robustez, não partidas adicionais:

| Mutação | Regra exercitada |
| --- | --- |
| missing_frames | Remove frames entre 13 e 17 minutos; @15 retorna missing_frame, sem preenchimento zero |
| duplicate_timestamp | Insere outro frame no mesmo timestamp, sem duplicar eventos; 42 frames/420 snapshots permanecem identificáveis |
| unknown_types | Insere FUTURE_EVENT e FUTURE_WARD; desconhecidos ficam separados e não mudam os totais conhecidos |
| ambiguous_role | Dois adversários TOP: comparação TOP ambígua e JUNGLE sem adversário |
| short_match | Resumo/timeline truncados a 120 s para simular payload parcial; checkpoints short_match e divergências finais detectadas |
| surrender_false | Flags surrender/early-surrender false preservadas; não são campos ausentes |
| early_surrender | Flags true são dados registrados, sem inferir remake por duração/flag |
| missing_optional | Remove campos opcionais do participante 1 e ouro do último frame; ausência aparece explicitamente |
| unsupported_patch | Altera apenas gameVersion para 16.20.999.1; não estabelece suporte a essa versão |

O jogo curto mantém estatísticas finais do original de propósito: a inconsistência testa detecção de payload incompleto, e não representa uma partida real de dois minutos. A auditoria não transforma esses cenários em amostra estatística multiversão. Testes adicionais corrompem separadamente kills no resumo e dragon no resumo de time para provar que as conferências detectam divergências, além de mismatch de identidade, ordenação, timeline vazia e zero válido.

## MatchRaw e matriz de suporte

A medição anexada encontrou 8 linhas no banco isolado: 8 summaries e 8 timelines não nulas, 8 pares completos, 93.686 bytes de summary comprimido e 703.416 bytes de timeline comprimida. IDs BR1_200 a BR1_207 são cópias sintéticas do fixture usadas pelo teste concorrente; não são oito observações reais independentes. O JSON contém instante, SQL e escopo. Bytes medem payload armazenado, não validade de descompressão. Não foi consultado volume de produção.

A matriz registra `fixture_validated` apenas para a versão/fila/mapa observados, `synthetic_only_unsupported` para 16.20.999.1 e `unvalidated` para o restante. Antes de ampliar suporte, adicionar partidas reais ao manifesto, registrar origem e repetir as conferências, documentando divergências e diferenças por campo. Não tratar uma mutação de rótulo como validação de regras de remake/item/evento de outro patch.

Esta entrega é auditoria offline; não muda projeções, rotas REST ou PROCESSING_VERSION e não exige migration/rebuild. MET-03/04/05/06 usam este corpus para validar as novas projeções; MET-09 ensaia o rebuild. O relatório JSON é o exemplo do contrato da ferramenta, sem introduzir endpoint REST.
