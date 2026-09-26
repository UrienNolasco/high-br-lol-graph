# Propriedade das métricas e da matemática

ARQ-04 mantém as fórmulas, os valores de versão e a representação HTTP existentes.

| Responsabilidade | Entrada |
| --- | --- |
| Resultado, evidência, qualidade e construção de métricas | `src/modules/matches/contracts/metric-contract.ts` |
| Checkpoints e janelas de uma partida | `src/modules/matches/contracts/temporal.ts` |
| Role, oponente e classificação de remake | `src/modules/matches/contracts/eligibility.ts` |
| Elegibilidade da população e disponibilidade de bans | `src/modules/matches/contracts/champion-population.ts` |
| Dimensões e seleção determinística de coorte | `src/modules/dataset/contracts/cohort.ts` |
| Precisão e amostragem de referências históricas | `src/modules/references/contracts/statistics.ts` |
| Quantis, distribuição empírica, banda DKW e taxa por minuto | `src/lib/math/` |
| DTO Swagger e exemplos de resposta | `src/modules/matches/dto/metric-result.dto.ts` |

Os consumidores importam somente os contratos necessários. O antigo barrel de
métricas misturava regras de coorte e de partida; ele foi removido. As políticas
de rosters disjuntos e investimento em visão continuam específicas do jogo no
domínio de referências. A biblioteca matemática não recebe IDs de partida,
jogadores, campeões ou tipos de transporte.

`metricContext` exige a versão de processamento do chamador. Os calculadores
já a recebiam na entrada; a mudança elimina o fallback para a versão corrente
do job. A versão da definição continua sendo `METRIC_VERSION = 1`. Os exemplos
HTTP identificam explicitamente sua geração sintética como 4.

As movimentações alteram a localização do código e sua proveniência; não
constituem um novo método estatístico nem uma nova geração dos dados.

`dataset/contracts/processing.ts` declara a geração **exata** suportada pelas
consultas e pelos manifests (`DATASET_PROCESSING_VERSION = 4`). A política de
leitura não avança automaticamente quando a execução de jobs muda. Os builders
e o estudo conservam sua condição existente de geração >= 4. Os parsers recebem
metadados explícitos; worker e CLIs que executam projeções fornecem a versão do
código em execução. Isso preserva a distinção entre proveniência e suporte de
leitura, inclusive quando versões futuras divergirem.

Compatibilidade transitória: os dois arquivos em `core/statistics` e o reexport
nomeado de `perMinute` em analytics têm remoção em ARQ-13, sob responsabilidade
de references e analytics. Não contêm uma segunda implementação. As pontes de
core para os contratos realocados estão enumeradas no ledger, com consumidor,
símbolos, proprietário e card de remoção; o modo estrito exige seu esvaziamento.
