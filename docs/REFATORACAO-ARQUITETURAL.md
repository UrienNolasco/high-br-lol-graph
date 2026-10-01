# Refatoração arquitetural concluída

Os 14 cards ARQ foram concluídos no board `high-br-lol` (#3). O código validado é `098858979b9f38e51eb7d69375c8de0bde352801`; as evidências foram integradas à `dev` local em `9e64893`. Não houve push ou deploy em produção nessa entrega.

## Arquitetura resultante

- `core`: infraestrutura técnica e clientes externos.
- `matches`: modelo normalizado, cálculos, projeções e contratos de partidas.
- `collector`: descoberta e linhagem da coleta.
- `processing`: jobs, leases, falhas e coordenação transacional.
- `dataset` e `stats`: preparação, escrita e leitura dos próprios dados.
- Worker e CLIs: adapters dos casos de uso; estudos ficam separados em `studies/`.

A [ADR](architecture/ADR-001-modular-boundaries.md), a [propriedade dos dados](architecture/data-ownership.md) e o [mapa de migração](architecture/migration-map.md) detalham as fronteiras. O CI exige arquitetura strict sem exceções transitórias.

## Aceite

O [relatório final](architecture/validation-arq14.json) registra os commits por card, ambiente, comandos, limitações e hashes das [evidências](architecture/evidence/arq14/). Foram aprovados build, TypeScript, 615 testes unitários, 160 HTTP, 64 integrações, 63 testes arquiteturais e 8 Python. Reconciliações, estudo, dados persistidos e benchmark foram comparados ao baseline.

Esses números descrevem o SHA validado. Mudanças posteriores precisam executar as verificações adequadas ao seu escopo.

## Retomada dos MET

ARQ-14 (#52) está em Done. As dependências MET originais continuam válidas; liberar a arquitetura não conclui as tarefas pendentes.

1. Preserve alterações locais antes de atualizar uma branch pausada.
2. Parta da `dev` atual e use contratos públicos finais, sem restaurar aliases removidos.
3. Respeite as dependências de cada card e execute arquitetura strict e as suítes afetadas.

O manifesto [architecture-refactor-backlog.json](analysis/architecture-refactor-backlog.json) preserva os critérios de aceite e a rastreabilidade. O board é a fonte do estado operacional atual.

## Plano e relatórios históricos

O plano detalhado original e os relatórios intermediários permanecem no Git. Foram retirados ou resumidos no checkout para não competir com a documentação atual:

```sh
git show 9e64893:docs/REFATORACAO-ARQUITETURAL.md
git show 9e64893:docs/architecture/validation-arq10.json
```

Os snapshots do inventário e os comandos contidos nas evidências descrevem suas revisões de origem; os caminhos atuais das ferramentas estão no [README](../README.md).
