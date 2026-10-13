# Validação dos writers definitivos

Resultados e limitações estão no [relatório](../../docs/analysis/write-optimization/report.md). Esta bancada usa PostgreSQL, RabbitMQ e Redis exclusivos, brutos congelados e a aplicação compilada. Não precisa de uma chave Riot. Execute os comandos na raiz do repositório, em Linux com Docker e cgroup v2.

## Dependências e corpus

Prepare o PostgreSQL/template conforme o [README do estudo](../architecture-study/README.md), na porta 55441, com `pg_stat_statements`. O template deve conter o schema aplicado e estar sem dados da aplicação. Os executores criam bancos novos e preservam os anteriores. Não aponte essa bancada para o banco da aplicação.

As 119 partidas aceitas são selecionadas do corpus `.tmp/architecture-study-corpus`; os hashes estão no manifesto. `BR1_3283642155` continua excluída por falha de identidade documentada. O teste longo repete essas partidas com IDs novos, preservando jogadores e campeões compartilhados: é uma carga sintética de histórico crescente, não 2.700 partidas independentes.

Para dependências novas, com esses nomes/portas ainda livres:

```sh
docker run -d --name highbr-write-rabbit --network host --cpus 1 --memory 512m -e RABBITMQ_NODE_PORT=55442 -e RABBITMQ_DIST_PORT=55443 -e 'RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2' rabbitmq:3.13-alpine
docker run -d --name highbr-write-redis --network host --cpus 0.5 --memory 128m redis:7-alpine redis-server --port 55444 --save '' --appendonly no
docker build -t highbr-write-runtime -f scripts/write-optimization/Dockerfile .
npm run build
mkdir -p .tmp/write-optimization
```

Se os containers já existem, use `docker start` em vez de recriá-los. As credenciais `integration` e `guest` dos scripts são exclusivas da bancada local. A aplicação de ensaio recebe configuração explícita; o `.env` da aplicação não é montado. O preload de telemetria bloqueia HTTP externo para verificar que os brutos locais bastam.

A imagem usada foi Node 26.11.1 em Debian; o ID da imagem e os hashes compilados ficam nos resultados. Isso não altera a imagem de desenvolvimento do Compose. PostgreSQL usa CPUs 4,5, workers usam 0,2 e o controlador usa 6,8; confira a topologia antes de reproduzir em outra máquina. Esses números estão explícitos nos scripts, não são uma recomendação universal de afinidade.

## Replay por etapa

O script `replay.cjs` espera o build original do commit `54cfb3e45a45c2b475bbb20f4ca304bda41d2912` em `.tmp/write-optimization/baseline-dist`. Gere esse build em um checkout separado, com as mesmas dependências, e copie seu `dist` para esse diretório; compile o candidato no checkout atual. Não misture dois builds no mesmo `dist` durante uma medição.

```sh
node scripts/write-optimization/replay.cjs
```

São três rodadas de quatro fases: anterior, eventos/timeline, eventos/agregados e completo. A rodada intermediária inverte a ordem. As fases intermediárias são montadas copiando somente os módulos compilados correspondentes sobre o build anterior. Todas usam a variante `A` do executor, ou seja, seus adapters compilados; não usam os antigos protótipos `B`/`B2`. Os resultados registram os hashes efetivamente carregados.

Para comparar conteúdo, monte um arquivo com `runs` contendo a rodada anterior e a candidata. O `comparison-input.json` registrado faz isso para a rodada 3; nele, `B` é apenas o nome da segunda entrada, sem executar o protótipo histórico.

```sh
node scripts/architecture-study/validate.cjs docs/analysis/write-optimization/comparison-input.json docs/analysis/write-optimization/equivalence.json
node scripts/write-optimization/stats-equivalence.cjs .tmp/architecture-study-corpus .tmp/write-optimization/baseline-dist docs/analysis/write-optimization/stats-equivalence.json
node scripts/write-optimization/read-aggregation-order.cjs docs/analysis/write-optimization/comparison-input.json docs/analysis/write-optimization/read-aggregation-order.json
node scripts/architecture-study/rebuild.cjs docs/analysis/write-optimization/full-3.json docs/analysis/write-optimization/rebuild.json A
```

Os nomes dos bancos nos arquivos de entrada precisam corresponder à execução que se pretende validar. Um código de saída zero do comparador não substitui verificar `exact`, classificação das diferenças e os critérios do relatório.

## Transporte real e carga contínua

```sh
node scripts/write-optimization/concurrency.cjs
node scripts/write-optimization/summarize-real.cjs
```

O primeiro comando executa cinco comparações curtas e depois 30 minutos com taxas de 1, 1,5 e 2 partidas/s, dez minutos em cada degrau. Há quatro IDs de aquecimento que são reenviados; eles não entram no numerador de novas conclusões. Jobs pré-carregados só ficam elegíveis na chegada programada. O recuperador permanece ativo e o executor rejeita conclusões de IDs ainda não oferecidos.

No ensaio longo, uma API separada faz leituras alternadas por campeão/posição e por jogador/métrica. Ela recebe uma CPU adicional; seu custo não entra no orçamento dos workers. Os dados registram latências, fila, locks amostrados, CPU, RSS, heap e memória dos cgroups. Não há instrumentação individual da espera por conexão. As amostras de dez segundos também não capturam todos os picos ou esperas breves.

O teste final de SIGTERM publica uma partida extra e encerra o container que a recebeu, verificando `COMPLETED` na primeira tentativa. Essa partida fica fora das contagens e taxas da carga de 30 minutos. Os containers da aplicação são removidos ao terminar; bancos de evidência ficam preservados. Os arquivos de resultados só estão completos quando contêm `finishedAt` sem `failure`.

Uma execução curta independente, útil para validar a bancada:

```sh
taskset -c 6,8 node scripts/write-optimization/real-worker.cjs .tmp/architecture-study-corpus docs/analysis/write-optimization/new-smoke.json --count=30 --rates=1 --workers=2 --slots=2 --shutdown-probe=1
```

Não execute replay, testes, export ou outro benchmark simultaneamente à carga medida. Ao terminar todas as validações, pare somente as dependências exclusivas:

```sh
docker stop --timeout 60 highbr-write-rabbit highbr-write-redis highbr-architecture-study-pg
```

## Regressões

Build e unitários: `npm run build` e `npm test -- --runInBand`. Os testes de integração relevantes são `processing.integration-spec.ts`, `dataset.integration-spec.ts` e `write-batches.integration-spec.ts`, usando `--runTestsByPath`, `TEST_DATABASE_URL` de um banco descartável com migrations aplicadas e `TEST_RABBITMQ_URL=amqp://guest:guest@127.0.0.1:55442`. Os testes limpam as tabelas desse banco.

O verificador de arquitetura deve ser executado com `npm run architecture:check`, comparando suas violações com o commit anterior; a implementação foi entregue com 27 violações preexistentes dos scripts do estudo, sem acréscimos. Não ajuste o baseline para fazer a verificação aparentar sucesso.
