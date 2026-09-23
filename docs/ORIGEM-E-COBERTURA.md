# Origem e cobertura da amostra — MET-18

Esta entrega registra a linhagem necessária a H01/H03/H07. A unidade de descoberta é uma resposta da lista de partidas de **uma conta consultada**, e a unidade analítica continua sendo a partida distinta. Nem prioridade RabbitMQ nem rank atual armazenado em `User` são evidência de origem histórica.

## Contrato persistido (lineageVersion=1)

`DiscoveryObservation` guarda UUID gerado para cada consulta bem-sucedida, source (`collector`, `search`, `sync`), observedAt UTC, queriedPuuid, region conhecida ou null, queueFilter solicitado ou null, requestedCount, startIndex e snapshot opcional de rank. `MatchDiscovery` relaciona a observação aos matchIds retornados, com chave composta (observationId,matchId). Uma consulta sem partidas também é preservada, com zero relações.

A gravação dos metadados e relações é transacional e respeita o bloqueio de manutenção do processamento. Um retry da persistência com o mesmo observationId é idempotente; novos resultados de consulta recebem novos UUIDs, mesmo com listas iguais. IDs repetidos dentro da mesma lista são deduplicados. Não existe FK à projeção Match: a descoberta ocorre antes da ingestão e deve sobreviver a um rebuild das projeções. A linhagem não publica trabalho nem altera agregados. O enqueue existente continua único por matchId; o commit do worker continua garantindo uma contribuição por partida.

Os fluxos registram a observação **antes de filtrar partidas já existentes**. Assim, collector → search da mesma partida preserva ambas as descobertas, embora search não reenfileire a partida concluída. Falha da persistência da observação impede a publicação daquele fluxo; uma observação já persistida continua representando a descoberta mesmo que a publicação posterior falhe. Não há promessa de capturar respostas perdidas antes do commit nem buscas mal-sucedidas.

| Fluxo | Consulta de partidas | Região registrada | Rank registrado |
| --- | --- | --- | --- |
| collector | últimos 20, sem filtro de fila | br1, origem da consulta às ligas | tier da resposta da liga, divisão/LP da entrada, fila da liga e instante dessa resposta |
| search | últimos 20, sem filtro de fila | br1, região efetivamente consultada | snapshot da entrada RANKED_SOLO_5x5 obtida nessa busca; null se ausente |
| sync | primeiros 100, queue=420, start=0 | região conhecida da conta, ou null | null: sync não consulta rank; o rank persistido sem instante de observação não é reutilizado |

Rank pertence exclusivamente à conta queriedPuuid em rankObservedAt. Pode ter sido observado depois do horário da partida. Ele **não é rank histórico da partida ou dos dez participantes**, nem torna uma partida ranqueada: collector/search não filtram filas. LP=0 é preservado como zero; rank ausente mantém todos os campos de rank null. `rankObservedAt` nunca pode ser posterior a observedAt. Identidade estável é PUUID, independente do nome exibido.

## Relatórios executáveis

```sh
npm run processing -- coverage
npm run processing -- lineage BR1_3200579475
```

Os comandos usam somente PostgreSQL, sem Riot/RabbitMQ/Redis, e são somente leitura. O snapshot do relatório é transacional RepeatableRead, impedindo misturar contagens de instantes diferentes. O relatório não carrega os payloads comprimidos nem consulta User.rank. Os metadados são lidos em memória: custo proporcional ao número de partidas e observações; usar offline para auditoria, não como endpoint de alta frequência.

`coverage` publica:

- **População:** distinctKnownMatches = união distinta de matchIds em MatchProcessing, Match e MatchDiscovery; importedMatches = linhas de Match; queriedAccounts = PUUIDs distintos consultados; participantAccounts = PUUIDs distintos das projeções. Também conta observações e consultas vazias. A população coletada é selecionada pelos fluxos, sem alegação de representar todas as partidas BR.
- **Par bruto:** complete, summaryOnly, timelineOnly, neither; denominador = distinctKnownMatches. coverage = complete / denominador (fração 0–1), null quando denominador zero. Completude significa presença dos dois blobs, não validação semântica, que cabe ao processamento. Mesmo uma descoberta ainda não enfileirada entra como neither.
- **Linhagem:** partidas com observação conhecida versus unknown; N de observações, partidas distintas e contas consultadas por source. As populações de sources se sobrepõem e não devem ser somadas para obter total de partidas.
- **Período importado:** mínimo/máximo inclusivos de Match.gameCreation, conhecidos/ausentes. Match sem projeção não recebe horário da descoberta como substituto. discoveryPeriod é uma janela separada dos timestamps das consultas. Os extremos não provam importação contínua; continuousCoverage permanece unknown.
- **Contexto:** contagens por gameVersion/mapId/queueId observados em Match, com null quando ausentes; consultas por source/region/queueFilter. Distribuição de rank conta **observações da conta consultada**, não participantes nem rank no horário do jogo. Sem snapshot, o grupo usa null explícito.

`lineage <matchId>` retorna as observações ordenadas por observedAt/id. Match legado sem observação retorna `source=unknown`, `reason=missing_discovery_observation`, `observations=[]`; nunca cria uma origem a partir de prioridade de fila, data do processamento, região inferida pelo ID ou rank atual. `exists` distingue histórico conhecido de ID inexistente. Uma redescoberta posterior de Match legado adiciona a observação nova, sem inventar como ele foi originalmente importado.

Exemplo sintético validado em integração: collector e search descobrem o mesmo matchId, a primeira gravação é repetida com o mesmo UUID. O banco termina com duas observações, duas relações, uma partida e uma contribuição por campeão. coverage publica distinctKnownMatches=1, discoveryObservations=2, queriedAccounts=1, participantAccounts=10 e rawPair.coverage=1. Dois rebuilds sucessivos reproduzem os agregados e mantêm as mesmas duas observações.

Outro cenário sintético: quatro partidas conhecidas têm, respectivamente, ambos os blobs, apenas resumo, apenas timeline e nenhum blob. O relatório retorna denominador=4, complete=1, coverage=0.25; uma consulta sync vazia conta como uma observação/conta consultada, mas não adiciona partida ao denominador. Todas as quatro origens legadas permanecem unknown.

## Migration, compatibilidade e rebuild

`20260923010000_discovery_lineage` adiciona duas tabelas e índices sem alterar linhas legadas. Não há backfill inferido. É compatível com jobs, raw e projeções existentes. Os produtores devem começar a gravar depois da migration; consumidores antigos ignoram as tabelas adicionais. Para rollback da aplicação, conservar as tabelas e dados, não apagá-los.

PROCESSING_VERSION permanece 1: nenhuma fórmula ou projeção analítica existente mudou. lineageVersion=1 identifica o novo contrato de observações. Rebuild não recria nem modifica descobertas, pois não pode reconstruir origem histórica a partir de MatchRaw. Teste de integração confirma invariância da linhagem e idempotência dos agregados após dois rebuilds. Nenhuma execução de migration/rebuild em produção faz parte desta entrega.

A interface desta task é o CLI JSON; não há alteração de contrato HTTP/OpenAPI. MET-19 pode consumir as observações como dimensão contextual e MET-17 mantém seu contrato próprio de métricas.

## Validação

`npm test -- --runInBand discovery collector-pipeline player-search sync-orchestrator` cobre deduplicação local, zero LP, ausências, datas inválidas/futuras, gate transacional, consultas vazias, registro antes da deduplicação e separação entre rank/fila/partida. `npm run build` verifica integração do cliente Prisma e CLI.

A suíte `test/integration/processing.integration-spec.ts` inclui cenários de múltiplas origens, retry, contribuição única, rebuild duplo, legado unknown, completude do par bruto e período. Executar somente no banco descartável com nome terminado em `_integration`, após aplicar a migration. Os testes existentes continuam verificando concorrência, rollback e recuperação do worker.

Validação local da branch MET-18 em 23/09/2026: build aprovado; 272 testes unitários em 55 suítes e 52 testes HTTP em 9 suítes aprovados; `prisma validate` aprovado. O cliente Prisma foi gerado em node_modules isolado para não interferir nas outras tasks.

Ensaio PostgreSQL/RabbitMQ isolado: migration aplicada sobre dados existentes; contagens e fingerprints de seis tabelas legadas permaneceram idênticos. Os 24 testes de integração passaram em 23,617 s, incluindo duas reconstruções completas com linhagem inalterada. Os comandos compilados coverage/lineage foram executados após a suíte e confirmaram par bruto 1/4, período conhecido de uma partida e origem unknown dos quatro matchIds do cenário final. Evidência detalhada: [analysis/met18-validation.json](analysis/met18-validation.json). Esses números descrevem o cenário de integração, não a coleta real ou produção.
