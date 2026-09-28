# Visão antecipada e vitória — MET-22 / H03

**Resultado: inviabilidade por amostra e cobertura.** O corpus contém uma partida real, BR1_3200579475, Solo/Duo 420, mapa 11, patch 16.2, iniciada em 02/02/2026. A ferramenta valida extração e publica frequências descritivas; não ajusta modelos, não estima efeito causal, significância ou quantidade ideal de wards. Seis configurações da mesma partida continuam sendo **N=1**. Réplicas de benchmark, participantes e descobertas repetidas não ampliam esse N.

## Protocolo e fontes

O protocolo versionado está em [analysis/met22-protocol.json](analysis/met22-protocol.json). A pergunta primária é a associação preditiva entre atividade reconhecida de visão até 15 min e vitória do time 100, considerando ouro, abates e torres observados até esse horizonte. A direção de todas as diferenças é **time 100 − time 200**; não se publicam duas observações complementares por partida. Faixas negativa, empate e positiva mostram a assimetria de lado sem duplicar a amostra.

O CLI lê apenas os pares explicitamente registrados em `corpus-manifest.json`. Reutiliza projeções de snapshots/eventos MET03/04, os tipos de ward MET11 e as funções de separação temporal/canonicalização MET19. **Não usa `events.wardsPlaced/wardsKilled` do MET19 como wards reconhecidas:** essas definições persistidas contam eventos literais, incluindo tipos desconhecidos, e permanecem inalteradas. A derivação de pesquisa tem `featureVersion=1` própria.

A fonte local não contém proveniência de processamento persistido ou descoberta. O manifest registra hashes dos JSONs e da implementação; metadados identificam transformação offline com código geração 4, `persistedProcessedAt=null` e linhagem desconhecida. Nenhum instante de conclusão de job, rank histórico ou cobertura populacional foi inventado. Não houve consulta ao banco, à rede ou à produção. O resultado não representa a população BR nem outros patches.

## Definições e fronteira temporal

| Feature | Unidade/fórmula | Fonte e ausência |
| --- | --- | --- |
| `goldDiff` | Ouro 100 − ouro200; soma de 5 participantes por time | Mesmo snapshot `pastOnly` em `[t−60000,t]`; elenco/campo incompleto resulta em null. |
| `killDiff` | Abates 100 − abates200 registrados | `CHAMPION_KILL`, ator atribuído; `killerId=0` ambiental explícito não dá abate a time. |
| `towerDiff` | Torres capturadas 100 − capturadas200 | `BUILDING_KILL/TOWER_BUILDING`, time beneficiário; `teamId` do dono destruído não é o capturador. |
| `recognizedPlacementDiff` | Colocações reconhecidas 100 − 200 | `WARD_PLACED` com `SIGHT_WARD`, `YELLOW_TRINKET`, `BLUE_TRINKET` ou `CONTROL_WARD`. |
| `recognizedRemovalDiff` | Remoções reconhecidas 100 − 200 | `WARD_KILL` com os mesmos tipos reconhecidos. |
| `controlPlacementDiff` | Control wards colocadas 100 − 200 | Subconjunto literal `WARD_PLACED/CONTROL_WARD`; não compras, inventário ou wards vivas. |
| `unknownPlacementDiff` / `unknownRemovalDiff` | Eventos de tipo desconhecido 100 − 200 | Tipos futuros, ausentes ou desconhecidos separados; nunca renomeados como visão reconhecida. |

São diferenças de contagem, não taxas por duração final. Denominadores do relatório são partidas independentes; a fração de tipos reconhecidos divide eventos registrados reconhecidos por todos os eventos de ward registrados, **não mede cobertura espacial nem completude das ações reais**. Denominador vazio produz null. Evento ausente em fonte observada válida permite zero; falta de snapshot, atribuição/timestamp inválido, conflito de identidade ou versão não suportada produz null com motivo. Duplicatas idênticas de eventos contam uma vez; conflito invalida a família correspondente.

A análise primária usa `[0,900000]`; sensibilidades predefinidas incluem10/15/20 min e janelas dos últimos 5 min `(t−300000,t]`. Não se escolhe o melhor horizonte após ver o resultado. Ouro continua sendo o estado no final de cada janela, e os contadores usam a respectiva janela. `sourceMaxTimestampMs` nunca ultrapassa t. Nenhum snapshot futuro, duração final, vision score final, resultado ou reconciliação final determina o valor dessas features.

A seleção retrospectiva de população/remake segue MET23 e é registrada somente em metadados, podendo excluir partidas curtas ou sem cobertura. Isso condiciona o estudo a partidas observáveis naquele horizonte. Role do resumo e rank de descoberta não são covariáveis comprovadamente conhecidas até t; ficam fora do modelo proposto. Composição de campeões não foi adicionada ao baseline limitado desta entrega. A pergunta individual, que exigiria ajuste por campeão/papel e dependência intratime, não é estimada.

## Resultados reais

| Horizonte cumulativo | Ouro | Abates | Torres | Colocações reconhecidas | Remoções reconhecidas | Control colocadas | Colocações desconhecidas |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10min | −649 | −2 | 0 | −3 | 0 | −2 | −88 |
| 15min, primário | 1689 | −1 | 1 | 5 | −3 | −3 | −142 |
| 20min | −820 | −10 | −1 | 6 | −4 | −3 | −221 |

O snapshot utilizado aos 15 min é 840357 ms, idade 59643 ms. Há 74 eventos reconhecidos de colocação/remoção entre 244 eventos registrados até 15 min: **30,33% reconhecidos e 170 desconhecidos**. Os eventos desconhecidos não são tratados como ausência de ward, nem a fração de reconhecimento como qualidade espacial.

O time 100 venceu. A faixa positiva de diferença de colocações aos 15 min contém uma partida e uma vitória: frequência amostral100%, intervalo Wilson95% **20,65%–100%**. Faixas sem observações têm frequência/intervalo null. Esse intervalo supõe independência entre partidas e não incorpora recorrência de jogadores, seleção de coleta ou multiplicidade das configurações. Com N=1 ele ilustra imprecisão; não fornece uma probabilidade confiável de vitória. Não há comparação entre faixas com suporte suficiente.

A auditoria final, separada das features, confere as colocações/remoções reconhecidas contra o resumo para os 10 participantes: **20 conferências válidas, sem divergências**. No jogo inteiro há 196 colocações reconhecidas,556 desconhecidas e 51 remoções reconhecidas. Reconciliação final alterada não modifica as features anteriores. O arquivo de resultados inclui todas as sensibilidades, motivos de ausência e exclusão, e contagem de N por faixa/split.

## Separação, incerteza e gate dos modelos

Split fixo por `gameCreation`: treino antes de 01/01/2026 UTC; validação de 01/01 inclusive até 01/02 exclusivo; teste a partir de 01/02. Todas as features/horizontes de uma partida seguem o mesmo split. O corpus tem **0 partidas em treino, 0 em validação e 1 em teste**, todas do mesmo patch. Identidade de fonte adicional por hash do conteúdo da timeline/elenco rejeita cópias com novo `matchId`, inclusive alterações de data/duração/rótulo no resumo. Entradas declaradas sintéticas são excluídas; um operador não deve rotular simulações como fontes reais.

A sensibilidade a jogadores recorrentes descarta partidas inteiras de validação com qualquer jogador de treino e partidas de teste com qualquer jogador de treino ou validação. Expõe N retido/descartado e exige novamente diversidade de resultados e amostra. A única partida fica no teste, mas não há conjuntos anteriores para avaliar dependência ou estabilidade; a sensibilidade é **não avaliável**. Essa política evita compartilhamento de jogadores entre avaliação e conjuntos anteriores, mas não elimina dependência entre partidas dentro do próprio teste.

Os gates operacionais, declarados antes de qualquer ajuste, exigem N≥500, treino≥300, validação/teste≥100 cada, pelo menos 20 resultados de cada classe em cada split, ≥90% de features completas e ≥80% de tipos de ward reconhecidos entre eventos registrados. São critérios conservadores deste protocolo, **não cálculo universal de poder**. O corpus falha em tamanho, separação, diversidade de resultado e reconhecimento de tipos; ter 100% de features numericamente completas em uma partida não supera esses limites.

O código publica `allowed=false` e razões, sem ajustar qualquer modelo. Mesmo com gate satisfeito, indica necessidade de execução de avaliação revisada separadamente; não dispara treinamento automaticamente. O plano reproduzível compara regressão logística regularizada de contexto (`goldDiff`, `killDiff`, `towerDiff`) com contexto+três exposições reconhecidas. Padronização aprende apenas no treino; hiperparâmetros são escolhidos na validação cronológica. O teste fechado compararia log loss/Brier/AUC, calibração e estabilidade, com intervalos pareados por partida e sensibilidade de jogadores. **Nenhum desses números foi produzido aqui.** Estabilidade entre patches também é desconhecida.

Ouro aos 15 min pode ser mediador da visão anterior; vantagem no jogo também pode permitir wardar mais. Portanto, mesmo uma melhoria preditiva futura não identificaria efeito causal total ou recomendaria “mais uma ward”. Janelas anteriores a objetivos só capturados selecionam oportunidades observadas; essa pergunta requer protocolo de disponibilidade/spawn e não foi acrescida ao presente estudo.

## Reprodução e contrato offline

```sh
npm run build
npm run vision-study -- --out /tmp/met22-study-NEW
npx jest --runInBand src/studies/vision/vision-study.spec.ts
```

Opções adicionais: `--corpus caminho.json --protocol caminho.json`. O diretório de destino deve ser novo; as fontes não são alteradas. O destino recebe publicação conjunta de:

- `features.jsonl`: 6 linhas/partida, apenas valores/razões/timestamps/janela/identificadores/split; sem labels, duração, finais, role, rank ou elegibilidade. Somente as allowlists numéricas `baseline/augmented` são covariáveis, não IDs/split.
- `labels.jsonl`: uma linha/partida, vitória do time 100 separada; resultado ambíguo é null.
- `metadata.jsonl`: coorte, seleção, linhagem desconhecida, identidade de fonte e cobertura/evidências por janela. Não é uma allowlist de preditores.
- `reconciliation.json`: conferências finais, independentes da extração até t.
- `results.json`: tabelas descritivas com incerteza, gates e limitações.
- `manifest.json`: protocolo, versões, hashes de fontes/código/arquivos e definições; sem relógio volátil da execução.

O exemplo completo está em [analysis/met22-study/manifest.json](analysis/met22-study/manifest.json) e [analysis/met22-study/results.json](analysis/met22-study/results.json). Mesmos arquivos, código e protocolo produzem bytes idênticos. Pesquisa offline não adiciona endpoint/OpenAPI, migration ou nova geração persistida. A validade do contrato é demonstrada pelo exemplo exportado e pelos testes de ausência, anti-leakage, identidade, gate, fronteiras e reprodução.
