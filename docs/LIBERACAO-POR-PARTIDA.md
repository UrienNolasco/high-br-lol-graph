# Ensaio de liberação por partida — MET-33

Esta entrega mede o caminho compilado das projeções e do relatório MET-17 em PostgreSQL descartável. Não publica aplicação nem executa ações em produção. O benchmark e o orçamento local abaixo são evidências de engenharia; a aceitação do produto com jogadores continua sendo o protocolo MET-34, sem feedback inventado.

## Reproduzir

Usar checkout integrado, dependências e cliente Prisma correspondentes, PostgreSQL exclusivo de teste com nome terminado em `_integration`. O comando exige `--reset-disposable` e limpa partidas, jobs, agregados e observações de descoberta desse banco. Usuários não são apagados. Não compartilhar o banco com outra suíte/worker. O benchmark não precisa de Redis, RabbitMQ, Riot ou CDN.

```sh
npm ci
npx prisma generate
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm run build
node scripts/benchmark-release.cjs --reset-disposable
```

`TEST_DATABASE_URL` é obrigatório; a URL não é registrada no artefato. O script importa serviços/controlador de `dist`, processa três cópias da fixture BR1_3200579475 com IDs/dias distintos, reconstrói as três, inicia um módulo HTTP Nest com controlador, validação, serviço e repositório reais, e mede seis rotas. Esse módulo isola o relatório dos schedulers/collectors; não é um teste de infraestrutura completa do AppModule.

A amostra científica contém **uma partida real, dez participantes, um patch, uma fila e um mapa**. Três cópias exercitam carga e integridade; não acrescentam partidas independentes. Por rota há dois aquecimentos excluídos e vinte GETs medidos, sequenciais, concorrência um. Latência inclui HTTP local, consulta PostgreSQL, cálculo e serialização/leitura do corpo; não inclui WAN. p50/p95 usam ordem `ceil(p*N)`, sem interpolação; amostras individuais, ambiente, versão e hashes ficam no JSON. Vinte requests não medem estabilidade de cauda em produção.

Ingestão mede worker com bruto gzip já presente, sem download/fila, separada do rebuild. O rebuild inclui limpeza, processamento e checkpoints; após conclusão, hashes do bruto e das contribuições lógicas coincidem. Somente `processedAt` é retirado do hash das contribuições; IDs, valores, evidências, denominadores, qualidade e linhagem permanecem comparados. GETs usam cliente Prisma instrumentado que falha se consultarem MatchRaw. Stubs dos serviços externos falham se chamados; a requisição HTTP ao próprio servidor local é permitida. Catálogos não aquecidos retornam indisponibilidade explícita.

## Medições e orçamento

O artefato [analysis/met33-release-benchmark.json](analysis/met33-release-benchmark.json) contém números medidos por rota, bytes e tempos. Bytes gzip são tamanho exato dos dois payloads armazenados. Bytes de projeções/dataset são `sum(pg_column_size(row))`, incluindo representação de tupla mas excluindo índices, espaço livre e overhead de relação/TOAST; não equivalem ao espaço total em disco. Não extrapolar capacidade apenas multiplicando esse número.

Medição em 23/09/2026, geração4, máquina compartilhada (carga registrada no artefato):

| Rota | p50 (ms) | p95 (ms) | Corpo máximo (bytes) |
| --- | ---: | ---: | ---: |
| summary | 317.9 | 358.3 | 41,371 |
| metric | 326.6 | 386.8 | 2,880 |
| evidence | 299.2 | 367.2 | 269 |
| episodes | 338.5 | 393.7 | 18,087 |
| economy | 351.1 | 480.6 | 133,524 |
| vision | 358.3 | 391.4 | 214,557 |

Ingestão local com bruto já presente: **0.315 partidas/s** em três cópias, mediana 3.026s/partida. Rebuild das três: **9.153s**. Por partida: 99,638 bytes gzip de bruto; 109,610 bytes de tuplas de snapshots; 1,022,776 bytes de eventos; 1,004,315 bytes de dataset em 877 linhas. Os valores de armazenamento não incluem índices/espaço livre. São custos locais observados, com N e ambiente restritos.

A matriz integrada passou no build, 509 unitários (90 suítes), 131 HTTP (25 suítes) e 50 PostgreSQL (14 suítes, dois comandos). Sete reconciliações compiladas por família e oito testes Python passaram; o corpus conserva uma partida real e nove variações sintéticas. Artefato de comandos/resultados: [analysis/met33-release-validation.json](analysis/met33-release-validation.json).

O orçamento de regressão usa a medição como baseline: p95 de cada rota e da ingestão e duração total de rebuild até **2×** o observado; payload até **1,05×** e bytes de tupla do dataset até **1,10×**. São margens explícitas de revisão local para ruído de máquina e mudanças do contrato, não SLA de produto acordado nem dimensionamento de produção. Uma regressão acima do limiar exige investigação/revisão do baseline com evidência; não atualizar números automaticamente para tornar a verificação verde. Medir a mesma máquina/configuração/fixture/geração antes de comparar.

```sh
node scripts/benchmark-release.cjs --reset-disposable \
  --baseline docs/analysis/met33-release-benchmark.json \
  --output /tmp/met33-recheck.json
```

O modo baseline exige saída distinta da entrada para conservar a referência e escreve medições/falhas de regressão antes de retornar erro. A segunda execução local passou sem violar os limiares; as amostras completas estão em [analysis/met33-release-recheck.json](analysis/met33-release-recheck.json). Mudança de geração exige novo baseline explícito, preservando o anterior no histórico Git. Limites funcionais do relatório permanecem: página padrão dez, máximo cinquenta, evidências padrão três/máximo vinte, dez mil eventos e trezentos frames como guardas do cálculo. Não são alegações de custo constante para toda partida.

## Cobertura e observabilidade

A evidência do corpus e reconciliações por família permanece nos scripts `audit-metrics-corpus.py` e `validate-*.cjs`, com discrepâncias e ausências qualificadas. A fixture tem wards de tipo desconhecido: `unknownWardEvents` não é falha de parser nem ward reconhecida. Eventos globais desconhecidos usam `quality.unknownType`; preservar payload/identidade e investigar crescimento por patch. Não zerar desconhecidos para obter cobertura artificial.

O benchmark registra tipos de evento, desconhecidos globais e de wards, quantidade/versão de snapshots, disponibilidade/proveniência do relatório e cobertura de cada definição/horizonte. `definitionVersion` do dataset e `metricVersion` da métrica cumprem o papel de **featureVersion**, independentes da geração persistida `processingVersion`; não inferir atualização de fórmula apenas pelo deploy. Cobertura usa contagens de linhas válidas/amostras e motivo de ausência, não dez jogadores como dez partidas independentes.

Na operação, acompanhar `processing -- status` (estados, idade/erros, manutenção) e `processing -- coverage` (pares brutos, patches, fontes). Para as novas definições, `/api/v1/dataset` informa N de partidas/jogadores, missingness, exclusões e não materializadas; segmentar patch/fila/mapa/posição e versão. Alertar para COMPLETED em geração anterior, mudança de proporção de null/unknown, perda de pares brutos, falhas/retries persistentes e divergências de reconciliação. Reproduzir no bruto preservado antes de atribuir mudança a comportamento dos jogadores.

O consumidor usa prefetch um por processo. O teste de seis chamadas concorrentes no mesmo processo encontrou expiração do limite implícito de cinco segundos de aquisição: cálculo síncrono de outra partida atrasava callbacks de uma transação já aberta. A geração4 prepara o dataset antes da publicação, grava contribuições antes dos agregados compartilhados e utiliza cálculo de totais de visão sem materializar relatórios completos repetidos. `enqueue`/`claim` têm limite operacional explícito de trinta segundos e espera de conexão de cinco; publicação continua limitada a trinta segundos, abaixo da lease de 120 segundos. O heartbeat de vinte segundos não preempta JavaScript síncrono: ampliar concorrência exige nova medição de CPU/atraso do event loop e, se necessário, admissão antes da lease ou isolamento de CPU. Não aumentar lease nem ocultar falhas como solução de capacidade.

## Migração, ensaio e retorno

1. Conferir backup/restauração e inventário de MatchRaw/linhagem, baseline, migrations aplicadas e versão da aplicação. O ensaio usa apenas banco descartável; os comandos administrativos operacionais abaixo são orientação para liberação futura.
2. Parar API, collector e todos os workers; preservar PostgreSQL e os pares brutos. Aplicar migrations aditivas da árvore integrada, gerar Prisma e compilar o mesmo checkout. A migration histórica inicial de processamento confiável tem pré-condição de tabelas vazias; não executá-la sobre instalação legada incompatível como se fosse conversão automática.
3. Executar `processing -- status`, `processing -- coverage` e rebuild offline da geração atual. Reentregar COMPLETED não atualiza versões; reconstrução é explícita. Se interrompido, manter leitura parada e executar `rebuild --resume`. O marcador de manutenção e travas impedem concorrência de reconstruções/admissão.
4. Validar estado sem manutenção, geração uniforme dos COMPLETED, preservação de bruto/linhagem/usuários, identidade das contribuições, ausência de duplicação e reconciliações. Repetir navegação contribuição → métrica → evidência e episódio → captura; ausências/catálogo frio continuam legíveis. Conferir migração idempotente e diff de schema vazio no banco de ensaio.
5. Reativação de serviços/deploy requer processo de liberação próprio. Não foi executada nesta task.

Para rollback de **código**, conservar migrations/tabelas/colunas aditivas e payloads, parar produtores/leitura e selecionar uma versão compatível. O predecessor de geração3 não materializa o dataset de geração4; mesmo que ignore a nova tabela, continuar ingestão com ele produziria cobertura histórica incompleta. Não prometer compatibilidade sem testar o checkout escolhido; manter novas rotas indisponíveis durante esse retorno. Um rollback de código não restaura semântica dos dados reconstruídos. Para restaurá-la, usar backup consistente ou rebuild offline com a versão desejada e bruto completo. Se voltar a geração4 depois, reconstruir novamente antes de oferecer histórico. Não executar down migration, remover MatchRaw, apagar maintenance manualmente ou editar processingVersion para simular conclusão.

Os testes de integração ensaiam rollback atômico, reentrega, concorrência, interrupção/retomada e reconstrução idempotente. O benchmark verifica novamente bruto e dataset na geração medida; não substitui esses testes de falha. Detalhes do protocolo: [RECONSTRUCAO-PROJECOES.md](RECONSTRUCAO-PROJECOES.md) e [DATASET-HISTORICO.md](DATASET-HISTORICO.md).

## Retenção proporcional ao volume

Sem volume/uso de produção medido, conservar bruto integral e linhagem durante o desenvolvimento e não definir prazo arbitrário de exclusão. Planejamento posterior deve medir `pg_total_relation_size` (incluindo índices/TOAST), crescimento diário, backups, compressão real e acesso/rebuild; comparar com orçamento de disco e janela operacional. O custo por partida deste corpus é um ponto de partida local, não estimativa de diversidade futura. Se necessário, avaliar arquivo de bruto comprimido com checksum e restauração ensaiada antes de qualquer política de expurgo; tal política não foi implementada aqui.
