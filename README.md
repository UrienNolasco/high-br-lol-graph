# High BR LoL Graph

Backend NestJS para coleta de partidas de League of Legends e consulta de estatísticas, relatórios e datasets históricos. Usa PostgreSQL/Prisma, RabbitMQ e Redis.

## Desenvolvimento

Consulte o [guia de entrada](docs/ONBOARDING.md) para configurar as dependências, variáveis e processos. A especificação HTTP é gerada pelos controllers e fica em `/reference` quando a aplicação inicia em modo API.

```sh
npm ci
npx prisma generate
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:architecture
npm run architecture:check -- --strict
npm run test:corpus
```

Os testes de integração exigem PostgreSQL e RabbitMQ descartáveis e executam limpeza de dados. Preparação e comandos: [processamento confiável](docs/PROCESSAMENTO-CONFIAVEL.md#validação).

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `src/modules/` | Domínio, casos de uso, contratos e adapters de cada funcionalidade |
| `src/core/` | Configuração, banco, fila, Redis, logs e clientes externos |
| `src/composition/` | Composição online e offline dos serviços |
| `prisma/` | Schema e histórico de migrations |
| `test/` | Integração e fixtures compartilhadas |
| `scripts/` | Verificador arquitetural e benchmark de release |
| `scripts/validation/` | Auditoria do corpus e reconciliação das métricas |
| `scripts/examples/` | Geração de exemplos para documentação e protótipo |
| `docs/analysis/` | Manifestos, protocolos e exemplos analíticos |
| `docs/architecture/` | Decisões, fronteiras e evidências da arquitetura |

`matches` possui o modelo normalizado; `collector` registra descoberta e origem; `processing` coordena jobs e publicação; `dataset` e `stats` possuem suas escritas. Worker e CLIs delegam aos casos de uso. Partidas, projeções, dataset, agregados e conclusão do job compartilham a transação de publicação; a captura bruta é preservada separadamente.

Consulte a [decisão arquitetural](docs/architecture/ADR-001-modular-boundaries.md), a [propriedade dos dados](docs/architecture/data-ownership.md) e a [verificação de fronteiras](docs/architecture/checking-boundaries.md). O CI exige modo estrito, sem exceções transitórias.

## Ferramentas

```sh
npm run audit:corpus -- --output /tmp/corpus-audit.json
node scripts/architecture-inventory.cjs --live --stdout > /tmp/architecture.json
npm run processing -- status
npm run processing -- coverage
npm run dataset -- definitions
```

Após `npm run build`, os reconciliadores em `scripts/validation/validate-*.cjs` verificam o fixture e geram os exemplos documentados. Os geradores em `scripts/examples/` são ferramentas manuais; não integram o runtime. Os comandos específicos estão nos respectivos guias abaixo. Resultados de auditoria temporários devem ir para `/tmp`; novos arquivos gerados só devem ser versionados quando forem fixtures, exemplos ou evidências necessárias.

O benchmark `scripts/benchmark-release.cjs` exige um banco descartável e `--reset-disposable`. Instruções e limites: [validação de release](docs/LIBERACAO-POR-PARTIDA.md).

## Guias

| Assunto | Documentação |
| --- | --- |
| Operação | [Processamento](docs/PROCESSAMENTO-CONFIAVEL.md), [reconstrução](docs/RECONSTRUCAO-PROJECOES.md), [origem e cobertura](docs/ORIGEM-E-COBERTURA.md) |
| Contratos e dados | [Métricas](docs/CONTRATOS-METRICAS.md), [corpus](docs/CORPUS-METRICAS.md), [dataset](docs/DATASET-HISTORICO.md), [referências históricas](docs/REFERENCIAS-HISTORICAS.md) |
| Projeções | [Eventos](docs/EVENTOS-NORMALIZADOS-MET04.md), [snapshots](docs/SNAPSHOTS-TIMELINE.md), [estatísticas finais](docs/ESTATISTICAS-FINAIS.md), [inventário](docs/INVENTARIO-FINAL.md) |
| Relatório | [Partida](docs/RELATORIO-PARTIDA-MET17.md), [contribuição](docs/CONTRIBUICAO-INDIVIDUAL.md), [experiência de revisão](docs/EXPERIENCIA-REVISAO.md) |
| Combate | [Combate](docs/COMBATE-MET13.md), [episódios](docs/EPISODIOS-DE-ABATES.md), [objetivos](docs/OBJETIVOS-E-ESTRUTURAS.md), [sequências](docs/SEQUENCIAS-E-VIRADAS.md), [bounties e roubos](docs/BOUNTIES-E-ROUBOS-REGISTRADOS.md) |
| Economia | [Progressão](docs/ECONOMIA-E-PROGRESSAO.md), [itens e habilidades](docs/PROGRESSAO-ITENS-HABILIDADES-MET16.md), [timeline de ouro](docs/TIMELINE-OURO.md) |
| Visão e mapa | [Visão por fase](docs/VISAO-POR-FASE.md), [presença amostrada](docs/PRESENCA-AMOSTRADA.md) |
| Histórico | [Comparações](docs/COMPARACOES-MET08.md), [popularidade](docs/POPULARIDADE-CAMPEOES.md), [indicadores opcionais](docs/INDICADORES-OPCIONAIS-MET29.md) |
| Planejamento | [Catálogo de oportunidades e backlog MET](docs/METRICAS-E-OPORTUNIDADES.md), [conclusão da refatoração](docs/REFATORACAO-ARQUITETURAL.md) |

## Histórico e manutenção

A refatoração foi aceita no código `0988589`; o relatório e suas evidências estão em [validation-arq14.json](docs/architecture/validation-arq14.json). Seus comandos e inventários históricos descrevem aquele SHA, não a disposição atual dos scripts.

Relatórios intermediários ARQ e o analisador de retenção anterior foram retirados do checkout após a conclusão. Permanecem no Git em `9e64893`:

```sh
git show 9e64893:docs/architecture/validation-arq10.json
git show 9e64893:scripts/analyze-example-match.py
```

O experimento offline MET-22 foi retirado do checkout; código, protocolo e resultados continuam disponíveis no commit `54e5186` (por exemplo, `git show 54e5186:docs/VISAO-ANTECIPADA-MET22.md`). As evidências históricas da refatoração registram sua validação naquele momento. A análise de visão das partidas permanece em `src/modules/matches/`.

Worktrees são ambientes temporários. Ao encerrar uma tarefa, integre seu trabalho, confira `git status` e remova o worktree com `git worktree remove <caminho>`. Preserve alterações pendentes e branches necessárias antes da remoção. Dependências e builds gerados não devem ser commitados.
