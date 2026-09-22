# Processamento confiável de partidas

## Garantias e fluxo

O PostgreSQL é a fonte de verdade dos trabalhos aceitos. RabbitMQ entrega notificações, com confirmação de publicação e possibilidade de reentrega. A contribuição de uma partida é aplicada uma única vez, mesmo com mensagens repetidas ou workers concorrentes.

1. API ou collector aguarda a criação de `MatchProcessing` antes de publicar. A prioridade mais alta recebida é preservada.
2. O worker obtém uma posse temporária de 120 segundos, identificada por token e renovada a cada 20 segundos.
3. Resumo e timeline completos da Riot são armazenados separadamente em `MatchRaw`, como JSON comprimido com gzip em `bytea`. São mantidos integralmente nesta fase de desenvolvimento.
4. Os parsers executam fora da transação. Partida, participantes, equipes, agregados e estado `COMPLETED` são gravados na mesma transação. Qualquer falha reverte esse conjunto, preservando os dados brutos.
5. O worker confirma a mensagem quando a partida foi concluída ou a responsabilidade pela recuperação foi registrada no banco. Se esse registro falhar, a mensagem original é recolocada na fila.

Estados: `PENDING`, `PROCESSING`, `RETRY_WAIT`, `COMPLETED` e `FAILED`. Uma partida aguardando timeline não aparece nos endpoints de partidas nem contribui para estatísticas. O resumo disponível fica guardado para a tentativa seguinte.

Antes de persistir a partida, o worker verifica identidades, duração, patch, equipes, vínculo dos participantes e os contadores utilizados nos frames/agregados. Dados incompatíveis falham definitivamente, preservando os payloads brutos para diagnóstico e sem gravar resultados parciais.

Somente processos `APP_MODE=WORKER` executam a recuperação, a cada 10 segundos, em lotes de até 50 trabalhos. A recuperação republica pendências, mensagens sem confirmação e trabalhos cuja posse expirou. Notificações não consumidas são republicadas após 60 segundos. Dois recuperadores podem publicar a mesma notificação; a posse e a transação impedem uma contribuição duplicada.

São permitidas seis tentativas por trabalho. O atraso começa em 30 segundos e cresce exponencialmente até 15 minutos; `Retry-After` pode determinar uma espera maior. Erros 400/401/403/404 de resumo e payloads inválidos são definitivos. Uma timeline 404 é uma pendência recuperável. Tentativas esgotadas ficam em `FAILED`, inclusive quando a última tentativa termina com a queda do worker.

## Schema e contratos

- `ChampionStats`, `PlayerStats` e `PlayerChampionStats` armazenam somas e contagens. Incrementos são atômicos no PostgreSQL. Médias são calculadas na leitura e arredondadas na resposta.
- DPM, GPM e CSPM são médias dos valores por partida, com o mesmo peso para cada partida. CSPM usa o CS final do resumo: `totalMinionsKilled + neutralMinionsKilled`.
- Cada agregado usa o `queueId` real. As consultas públicas existentes de estatísticas de jogadores/campeões usam a fila 420.
- O patch é obrigatório. Jogadores têm agregados por patch e `ALL`; campeões globais continuam por patch.
- Consultas de atividade e distribuição por posição isolam o patch exato: `16.2` não inclui partidas de `16.20`.
- Os cinco campeões mais jogados vêm de todo o histórico agregado do jogador. Empates são ordenados por `championId`.
- `lastPlayedAt` é a maior data de criação das partidas, independentemente da ordem de chegada. Datas passam pelo serializador como ISO 8601.
- CSD/GD/XPD aos 15 minutos usam o primeiro frame no intervalo `[900000, 960000)` e adversário único da mesma posição no outro time. Partidas menores que 15 minutos, frames ausentes e posições não reconhecidas não entram no denominador. Sem amostras válidas, a API retorna `null` nesses três campos.
- `MatchTeam` é único por `(matchId, teamId)`. `objectivesTimeline` agora contém a lista de eventos da timeline, atribuídos ao time que conquistou o objetivo. Em destruição de estruturas, o `teamId` da Riot indica o proprietário destruído; o beneficiário é o adversário.

Não houve revisão do algoritmo de tier nem implementação das novas métricas de visão. `banRate` e `pickRate` continuam com o comportamento anterior. As mudanças de contrato são a nulabilidade dos três indicadores de rota e a lista efetiva de eventos em `objectivesTimeline`.

## Instalação e operação

A migration `20260922142542_reliable_processing` foi criada pelo Prisma com o timestamp UTC real. Ela exige tabelas de partidas e agregados vazias, conforme o estado de desenvolvimento informado. Se encontrar dados nessas tabelas, aborta a transação. Usuários podem ser preservados. Não foi implementada conversão dos agregados antigos, que não tinham as respostas completas necessárias à reconstrução.

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
```

Use `DATABASE_URL` do ambiente desejado. Comandos administrativos não iniciam API, collectors, Redis ou RabbitMQ:

```sh
npm run processing -- status
npm run processing -- retry BR1_3200579475
npm run processing -- retry --all
```

`retry` recoloca apenas trabalhos `FAILED` em `PENDING`, reinicia o contador de tentativas e preserva os payloads armazenados. Os workers republicam os trabalhos. Corrija a causa antes de retomar: chave inválida, falha de parser ou payload inválido continuam falhando se nada mudar.

A verificação de manutenção e o retry compartilham a mesma transação e trava de admissão, impedindo que um retry manual atravesse o início de uma reconstrução.

### Reconstrução offline

Pare API, collector e todos os workers antes de iniciar. Mantenha PostgreSQL disponível. Se usar o Compose do projeto:

```sh
docker compose stop api collector worker worker-2
npm run processing -- rebuild
# Se o comando for interrompido, corrija a causa e retome:
npm run processing -- rebuild --resume
# Somente após a conclusão:
docker compose start api collector worker worker-2
```

A reconstrução preserva usuários e payloads brutos; limpa partidas e agregados e reaplica os payloads completos. Trabalhos sem o par de payloads permanecem pendentes para a coleta posterior. Antes da limpeza, o comando recusa uma base com partidas concluídas sem payloads completos.

Um marcador persistente bloqueia novas admissões e posses normais durante a reconstrução, inclusive após interrupção. A API deve permanecer parada para não expor resultados parciais. Uma trava no PostgreSQL impede comandos de reconstrução simultâneos. Cada partida tem seu próprio commit; `--resume` reutiliza os commits concluídos e reinicia as tentativas restantes. A execução tem limite de uma hora; se exceder, mantenha os serviços parados e use `--resume`.

A constante `PROCESSING_VERSION` versiona os resultados. Alterações na lógica de extração/agregação exigem incrementar essa constante e executar uma reconstrução completa. Reentregar uma partida já concluída não reaplica sua contribuição, mesmo após uma mudança de versão. Não existe substituição incremental de uma contribuição nesta entrega.

Logs estruturados registram conclusão/falha, tentativas, erros, recuperação e idade da pendência mais antiga. `processing -- status` mostra contagens por estado, manutenção e as 20 falhas mais recentes.

## Validação

```sh
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Os testes reais requerem PostgreSQL 15 e RabbitMQ 3.13 exclusivos para teste. Configure `DATABASE_URL` para aplicar as migrations nesse banco. A suíte recusa nomes de banco que não terminem em `_integration` e limpa suas tabelas a cada caso:

```sh
DATABASE_URL=postgresql://integration:integration@localhost:55439/high_br_integration npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://integration:integration@localhost:55439/high_br_integration \
TEST_RABBITMQ_URL=amqp://guest:guest@localhost:55679 \
npm run test:integration
```

A suíte usa os JSONs `BR1_3200579475` e variações controladas. Verifica concorrência entre conexões independentes, incrementos compartilhados, rollback após gravação dos agregados, payload parcial, isolamento por fila, ausência de amostras, expiração de posse, Retry-After, publicação interrompida, reentrega após commit, falha de banco antes do ACK, reconstrução retomada e ranking de campeões com histórico completo. O job de testes do workflow de deploy também executa a suíte com serviços isolados.

Também cobre oito variações de payload inválido sem resultados parciais, isolamento entre patches com prefixo comum, esgotamento de tentativas após queda do worker e bloqueio do retry durante manutenção.

Na imagem compilada, os mesmos comandos administrativos estão disponíveis por `node dist/processing-cli.js status`, `node dist/processing-cli.js retry BR1_3200579475` e `node dist/processing-cli.js rebuild [--resume]`, sem depender do `ts-node` de desenvolvimento.

Validação local em 22/09/2026: 253 testes unitários, 48 testes HTTP e 22 testes de integração passaram. O schema Prisma foi validado e as dez migrations foram aplicadas em um banco descartável vazio. O build gera `dist/main.js` e `dist/processing-cli.js`, e o comando compilado `status` foi executado contra o PostgreSQL de teste. O workflow verifica esses executáveis e o CLI antes do deploy. A validação usa fixtures da Riot e não inclui execução em produção.
