# Guia de entrada

Este guia cobre a execução local. Os contratos HTTP são gerados pelos controllers em `/reference`; garantias de ingestão, retry e recuperação estão em [Processamento confiável](PROCESSAMENTO-CONFIAVEL.md).

## Preparação

O projeto usa npm e inclui `package-lock.json`. Os Dockerfiles e o CI usam Node 20; instale também Python 3 para o auditor offline. PostgreSQL, RabbitMQ e Redis são necessários para a aplicação online.

```sh
npm ci
npx prisma generate
cp .env.example .env
```

Preencha `.env` antes de iniciar a stack. O exemplo não contém todas as variáveis utilizadas pelo Compose:

| Variáveis | Uso |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Banco local e interpolação do Compose |
| `DATABASE_URL` | Prisma e comandos executados no host |
| `RABBITMQ_URL`, `RABBITMQ_QUEUE` | Conexão e fila; necessárias no worker |
| `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS` | Credenciais locais do broker |
| `REDIS_HOST`, `REDIS_PORT` | Redis |
| `RIOT_API_KEY` | Credencial do processo executado no host |
| `RIOT_API_KEY_WORKER_1`, `RIOT_API_KEY_WORKER_2` | Credenciais mapeadas pelo Compose para workers e collector |
| `APP_MODE` | `API`, `WORKER` ou `COLLECTOR` |
| `PORT`, `COLLECTOR_PORT`, `LOG_LEVEL` | Listeners e logs |

Dentro do Compose, os hosts são `postgres`, `rabbitmq` e `redis`. Fora dele, use os endereços e portas publicados no host. Não reutilize uma URL de produção nos comandos de desenvolvimento.

## Stack local

```sh
docker compose up -d --build
```

O Compose define API, dois workers, collector, PostgreSQL, RabbitMQ e Redis. A API publica a porta 3000. A coleta online usa a API Riot; configure as credenciais e a política do collector antes de habilitá-la.

Para executar Node no host com as dependências já disponíveis:

```sh
npx prisma migrate deploy
APP_MODE=API npm run start:dev
# Em outro terminal, quando necessário:
APP_MODE=WORKER npm run start:dev
```

O primeiro comando aplica migrations na conexão `DATABASE_URL` configurada. Nunca renumere migrations existentes; novas migrations devem usar o gerador oficial e o relógio real.

## Validação

```sh
npm run build
npx tsc --noEmit
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:architecture
npm run architecture:check -- --strict
npm run test:corpus
npm run audit:corpus -- --output /tmp/corpus-audit.json
```

A integração real usa `TEST_DATABASE_URL` e `TEST_RABBITMQ_URL`. O banco precisa terminar em `_integration` e ser descartável: a suíte limpa dados. Execute integração e benchmark serialmente. Veja a [preparação da integração](PROCESSAMENTO-CONFIAVEL.md#validação) e a [validação de release](LIBERACAO-POR-PARTIDA.md).

## Onde trabalhar

- Casos de uso e domínio: `src/modules/`; infraestrutura compartilhada: `src/core/`.
- Montagem online/offline: `src/composition/`; processamento e dataset têm CLIs próprios.
- Ferramentas offline: `scripts/validation/` e `scripts/examples/`; usam a composição pública em `src/composition/study-api.ts`.
- Reconciliações: `scripts/validation/`; geradores de exemplos: `scripts/examples/`.
- Fronteiras permitidas: [ADR](architecture/ADR-001-modular-boundaries.md), [ownership](architecture/data-ownership.md) e [checker](architecture/checking-boundaries.md).

Importe contratos públicos entre módulos. A preparação pesada ocorre antes da transação; publicação de partidas, dataset, agregados e `COMPLETED` precisa permanecer atômica. Consulte os [runbooks](PROCESSAMENTO-CONFIAVEL.md) antes de alterar processamento ou reconstrução.

O [README](../README.md) organiza os guias por assunto. O inventário original e os relatórios de aceite são evidências de revisões identificadas por SHA; para consultar o grafo atual, use `node scripts/architecture-inventory.cjs --live --stdout`.
