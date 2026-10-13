# Validação da arquitetura de processamento

Esta bancada compara o processamento atual com adaptações de persistência e três desenhos de publicação do dataset. Os protótipos ficam exclusivamente neste diretório. O código de produção e as migrations da aplicação não são alterados.

| Variante | Persistência | Publicação |
| --- | --- | --- |
| A | Adapters atuais | Transação atual |
| B | Eventos por recordset SQL e retorno reduzido da timeline | Transação atual |
| B2 | B, dataset por recordset SQL e UPSERTs de estatísticas agrupados | Transação atual |
| C | Metadados por partida, grupos de métricas em JSONB por sujeito e horizonte | Transação atual |
| D | Layout C e tarefas duráveis de publicação de métricas e agregados | Três transações e consumidores independentes |
| E | Metadados por partida, dimensões por sujeito e horizonte, valores das métricas em colunas tipadas | Transação atual |

D mede a separação da publicação. A preparação das métricas ainda ocorre no primeiro estágio. Ela não representa uma implementação completa de cálculo assíncrono, materialização sob demanda ou separação OLTP e OLAP. Seu indicador de término inclui os consumidores posteriores; o `COMPLETED` do coordenador original, sozinho, não indica que D terminou. O contrato de disponibilidade das rotas HTTP precisaria ser adaptado antes de integrar D à aplicação.

Os dados originais estão em `.tmp/architecture-study-corpus`, ignorados pelo Git. O manifesto com IDs e hashes está em `docs/analysis/architecture-study/corpus-manifest.json`. São 120 partidas reais distintas, com jogadores compartilhados, não observações estatisticamente independentes. Uma delas é rejeitada pela validação atual de identidade dos participantes; a causa e o diagnóstico estão em `corpus-rejection.json`. A exclusão nas medições precisa ser solicitada explicitamente com `--exclude-rejected=1`.

**Ambiente de execução**

Os comandos partem da raiz do repositório. Usam as dependências instaladas e a aplicação compilada por `npm run build`. A coleta é independente do backend:

```sh
python3 scripts/architecture-study/collect.py .tmp/architecture-study-corpus --target 120
```

A chave é solicitada sem eco e permanece apenas na memória do coletor. O coletor identifica seu cliente HTTP, respeita `Retry-After` e aplica espaçamento conservador entre chamadas. Uma nova coleta por liga pode selecionar partidas diferentes; para reproduzir as medições existentes, use os arquivos congelados e confira os hashes do manifesto.

O PostgreSQL experimental usa porta 55441 e credenciais locais `integration`. Para criar uma instância nova:

```sh
docker run -d --name highbr-architecture-study-pg --network host --cpus 2 --cpuset-cpus 4,5 --memory 2g -e POSTGRES_USER=integration -e POSTGRES_PASSWORD=integration -e POSTGRES_DB=highbr_architecture_study postgres:15-alpine -p 55441 -c shared_preload_libraries=pg_stat_statements -c track_io_timing=on -c shared_buffers=256MB
DATABASE_URL=postgresql://integration:integration@127.0.0.1:55441/highbr_architecture_study node_modules/.bin/prisma migrate deploy
docker exec -i highbr-architecture-study-pg psql -U integration -p 55441 -d highbr_architecture_study < scripts/architecture-study/schema.sql
```

Se esse container já existe, use `docker start highbr-architecture-study-pg`. Não recrie o template com dados dentro dele. O executor cria um banco por variante e rodada, com nome derivado do relógio real, e não apaga bancos existentes.

As afinidades correspondem ao hardware estudado. Confirme a topologia com `lscpu -e=CPU,CORE,SOCKET` antes de reutilizar os números em outra máquina. As rodadas principais prendem Node aos processadores lógicos 0 e 2, de núcleos físicos distintos; a primeira rodada exploratória usou os irmãos SMT 0 e 1. Seus valores absolutos não devem ser agrupados.

**Medição e equivalência**

```sh
taskset -c 0,2 node scripts/architecture-study/run.cjs .tmp/architecture-study-corpus docs/analysis/architecture-study/new-round.json --variants=A,B,B2,C,D,E --workers=2 --count=120 --exclude-rejected=1
taskset -c 0,2 node scripts/architecture-study/validate.cjs docs/analysis/architecture-study/new-round.json docs/analysis/architecture-study/new-validation.json
```

O cronômetro inclui leitura e descompressão do bruto no banco, preparação, coordenador real, escrita e commit. Em D, inclui a drenagem dos estágios posteriores. Exclui download, RabbitMQ, bootstrap e aquecimento. `--workers` controla processos; `--slots` controla partidas simultâneas por processo. Cada processo possui pool de três conexões. `--arrival-rate` programa chegadas independentemente da velocidade do processamento, com atribuição circular fixa aos consumidores.

As comparações abrangem nove conjuntos de projeções e agregados, todas as contribuições de cada partida, quatro consultas reais do repositório e uma exportação delimitada. A validação compara também o JSON textual retornado pelo PostgreSQL, para não esconder diferenças numéricas no decoder do Prisma. Timestamps operacionais e IDs substitutos de equipes e estatísticas são excluídos; IDs determinísticos do dataset são mantidos. A tolerância numérica é diagnóstica e não autoriza alterar o contrato de produção.

```sh
taskset -c 0,2 node scripts/architecture-study/failures.cjs docs/analysis/architecture-study/new-failures.json
taskset -c 0,2 node scripts/architecture-study/rebuild.cjs docs/analysis/architecture-study/new-round.json docs/analysis/architecture-study/new-rebuild.json
taskset -c 0,2 node scripts/architecture-study/read-benchmark.cjs docs/analysis/architecture-study/new-round.json docs/analysis/architecture-study/new-reads.json
```

Os testes de falha encerram processos reais com `SIGKILL`, verificam rollback, retomada e ausência de contagem duplicada. A reconstrução usa o coordenador existente, com cinco partidas reais, uma interrupção e duas execuções completas contando a retomada. Não valida troca de gerações online.

O ensaio de leitura conserva `DatasetQueryRepository` e substitui apenas a consulta que conta jogadores distintos por grupo, eliminando suas varreduras correlacionadas. Registra erros e diferenças, além de tempos; sucesso do processo sozinho não significa que todas as consultas cumpriram um limite de latência.

Os ensaios adicionais usam os resultados anteriores, sem alterar o código da aplicação:

```sh
node scripts/architecture-study/version-transition.cjs docs/analysis/architecture-study/new-rebuild.json docs/analysis/architecture-study/new-version-transition.json
taskset -c 0,2 node scripts/architecture-study/plans.cjs docs/analysis/architecture-study/new-round.json docs/analysis/architecture-study/new-query-plans.json
node scripts/architecture-study/validate-scale.cjs docs/analysis/architecture-study/scale-w4.json docs/analysis/architecture-study/scale-w2-slots2.json docs/analysis/architecture-study/scale-validation.json
python3 scripts/architecture-study/summarize.py
```

`version-transition.cjs` muda constantes apenas em memória, reconstrói uma cópia isolada de cada banco e retira uma definição do materializador. Verifica remoção das linhas antigas e compatibilidade de leitura por versão; não implementa uma nova fórmula ou troca online de gerações. `plans.cjs` compara também projeção de colunas necessárias nas CTEs e `SET LOCAL jit=off`, registrando `EXPLAIN (ANALYZE, BUFFERS)` em JSON. `validate-scale.cjs` compara as mesmas variantes entre duas configurações de concorrência, com representação textual do banco e igualdade estrita das projeções; diferenças de ordem de soma nos agregados são registradas separadamente.

Não execute medições de desempenho concorrentes no mesmo container. Os comandos de planos e validação devem rodar depois do executor de capacidade. A bancada de replay não cria observações de descoberta: a comparação de lineage cobre a marcação de origem desconhecida.

**Histórico e sequência completa**

```sh
taskset -c 0,2 node scripts/architecture-study/history.cjs docs/analysis/architecture-study/new-round.json docs/analysis/architecture-study/new-history.json 5
taskset -c 0,2 node scripts/architecture-study/run.cjs .tmp/architecture-study-corpus docs/analysis/architecture-study/new-history-writes.json --variants=A,B2,C,E --workers=2 --count=60 --templates=docs/analysis/architecture-study/new-history.json --id-prefix=NEW_ --exclude-rejected=1
```

O histórico multiplicado reutiliza jogadores, campeões, patches e datas; é uma carga sintética densa, não centenas de novas partidas independentes. As cópias preservam o bruto com novos IDs e os totais agregados. Servem para observar volume de índices, armazenamento e consultas, sem provar comportamento de uma população muito maior.

`orchestrate.py` encadeia leituras, reconstrução, repetição, escala, chegadas e histórico. Registra comandos, PIDs e códigos de saída em `execution.json`, interrompendo a sequência na primeira falha. `--from N --through N` permite executar uma etapa depois de verificar que a execução anterior terminou. Antes de iniciar nova medição, confira os processos e o handle existente; um arquivo de status sozinho não comprova término.

Os resultados representam este corpus, runtime e distribuição de recursos. A equivalência ao código atual não é uma validação científica independente de cada indicador nos patches coletados. Os testes não demonstram que uma linguagem ou arquitetura não implementada seria mais lenta.
