# high-br-lol-graph

### Visão Geral e Objetivos do Projeto

`high-br-lol-graph` é um projeto pessoal para aprendizado que estou desenvolvendo para entender como trabalhar com apis externas que entregam grandes volumes de dados, onde serão realizados diversos calculos de analise em cima desses dados. Vou fazer isso processando e analisando estatísticas de partidas de League of Legends, através da api oficial DRAGON da Riot Games.

- Objetivo Principal: Calcular a taxa de vitória (win rate) de campeões e analisar confrontos diretos (matchups) favoráveis e desfavoráveis.
- Escopo dos Dados: A análise será focada exclusivamente em jogadores de alto elo (Mestre, Grão-Mestre, Desafiante) do servidor brasileiro (BR).
- Granularidade: O sistema se concentrará no resultado final da partida (vitória/derrota) e nos campeões envolvidos. Detalhes como builds de itens, runas ou dados da timeline da partida estão fora do escopo.
- Requisito Chave: Todas as estatísticas devem ser segmentadas por patch do jogo para permitir análises de meta.
- Modelo de Atualização: Os dados serão atualizados em lote (batch), com uma frequência diária sendo suficiente.
- Orçamento e Deploy: O projeto tem um orçamento de R$ 0,00 e será executado inteiramente em um ambiente de desenvolvimento local, sem a necessidade de deploy em produção, porem estarei desenvolvendo orientado a containers para simular um ambiente produtivo.

### Arquitetura do Sistema

A arquitetura escolhida é um pipeline de dados desacoplado e orientado a eventos, implementado em um monorepo. A orquestração de todos os serviços será feita localmente via Docker Compose.

#### Fluxo de Dados

O fluxo de dados segue um padrão claro de responsabilidades separadas para garantir a resiliência e a manutenibilidade do sistema.

```bash
[1. Coletor] -> [2. Fila de Mensagens] -> [3. Processador] -> [4. Banco de Dados] <- [5. API]
```

- Coletor (Collector): Um processo em lote que busca novos IDs de partidas na API da Riot e os publica na fila de mensagens.
- Fila de Mensagens (Message Queue): Atua como um buffer, desacoplando o Coletor do Processador. Garante que nenhuma partida seja perdida se o processador estiver lento ou offline.
- Processador (Worker): Um serviço que consome as mensagens da fila, busca os detalhes completos da partida, realiza os cálculos e atualiza as tabelas de estatísticas no banco de dados.
- Banco de Dados (Database): Armazena tanto os dados brutos (quais partidas foram processadas) quanto os dados agregados (as estatísticas calculadas).
- API: Um servidor HTTP que expõe os dados pré-calculados do banco de dados para consulta. Não realiza cálculos pesados.

### Stack de Tecnologias

- Orquestração Local: Docker & Docker Compose
- Linguagem & Framework: Node.js com NestJS & TypeScript
  - nestjs/cache-manager para salvar o valor de uma requisão.
- Banco de Dados: PostgreSQL
- Fila de Mensagens: RabbitMQ
- Scalar para documentação da API
- Typeorm

### Error Handling e Resiliência

O sistema implementa uma estratégia robusta de tratamento de erros para garantir a estabilidade e confiabilidade ao trabalhar com APIs externas e processamento de grandes volumes de dados.

#### Arquitetura de Error Handling

**1. Interceptor Centralizado de Erros HTTP**

- Localizado no `RiotModule`, o interceptor captura automaticamente todos os erros HTTP da API da Riot Games
- Mapeia códigos de status HTTP para exceções específicas do NestJS
- Logging detalhado para debugging e monitoramento
  **2. Mapeamento de Códigos de Status**

```typescript
400 → BadRequestException      // Dados inválidos enviados
401 → UnauthorizedException    // API key inválida ou expirada
403 → ForbiddenException       // Acesso negado à API
404 → NotFoundException        // Recurso não encontrado
429 → HttpException            // Rate limit excedido
500 → InternalServerErrorException // Erro interno da Riot
502/503 → ServiceUnavailableException // API indisponível
504 → GatewayTimeoutException  // Timeout na API
```

**3. Validação de Configuração**

- Verificação obrigatória da variável `RIOT_API_KEY` na inicialização
- Falha rápida se configurações essenciais estiverem ausentes
- Type safety garantido para evitar erros em runtime
  **4. Estratégias de Recuperação**
- **Rate Limiting**: Logs de warning para monitoramento, preparado para implementação de retry logic
- **Timeouts**: Configurado para 5 segundos, evitando travamentos
- **Erros de Rede**: Tratamento específico para problemas de conectividade
- **Falhas de API**: Propagação de exceções apropriadas para camadas superiores
  **5. Logging Estruturado**
- Logs de erro com contexto completo (URL, status, dados da resposta)
- Stack traces para debugging de problemas de rede
- Logs de warning para situações que requerem atenção (rate limiting)
  **6. Benefícios da Abordagem**
- **Desacoplamento**: Services focam na lógica de negócio, não no tratamento de erros HTTP
- **Consistência**: Todos os erros da API são tratados uniformemente
- **Observabilidade**: Logs detalhados facilitam debugging e monitoramento
- **Manutenibilidade**: Centralização facilita mudanças e melhorias futuras
- **Type Safety**: Validações garantem que o código seja robusto em runtime
  **Fluxo de Error Handling:**

```
[Service] → [HttpService] → [Axios] → [Riot API]
                  ↓
              [Interceptor]
                  ↓
          [Error Classification]
                  ↓
       [NestJS Exception] → [Logging] → [Error Response]
```

### Sincronização entre Collector e Worker

Adicionei o Redis para resolver o problema de concorrência entre o CollectorService e o WorkerService pois ambos compartilham um único e restrito limite de taxa (100 requisições a cada 2 minutos).

O Redis entra como um contador centralizado e de alta velocidade. Antes de qualquer serviço fazer uma chamada à API, ele registra um "ticket" com timestamp no Redis. O sistema então verifica nesse registro compartilhado quantas requisições foram feitas nos últimos 2 minutos. Se o limite for atingido, a requisição aguarda.

Essencialmente, o Redis está sincronizando o "direito de fazer uma requisição à API" entre o Collector e o Worker, garantindo que eles operem em conjunto e de forma eficiente, sem serem bloqueados.

### Estrutura de Pastas do Projeto:

```bash
high-br-lol-graph/
├── .env                  # Variáveis de ambiente (NÃO ENVIAR PARA O GIT)
├── .env.example          # Exemplo para as variáveis de ambiente
├── .gitignore            # Arquivos e pastas a serem ignorados pelo Git
├── docker-compose.yml    # Orquestrador dos nossos contêineres (Postgres, RabbitMQ, App)
├── Dockerfile            # Receita para construir a imagem da nossa aplicação
├── nest-cli.json         # Configuração da CLI do NestJS
├── package.json          # Dependências e scripts do projeto
├── README.md             # Documentação do projeto
├── tsconfig.build.json   # Configuração do TypeScript para o build
├── tsconfig.json         # Configuração principal do TypeScript
└── src/                  # O coração da nossa aplicação
    ├── main.ts           # Ponto de entrada da aplicação. Aqui decidiremos qual serviço iniciar.
    ├── app.module.ts     # Módulo raiz que une tudo.
    │
    ├── core/             # Lógica e módulos compartilhados entre todos os serviços.
    │   ├── config/       # Módulo para gerenciar variáveis de ambiente (@nestjs/config)
    │   │   ├── config.module.ts
    │   │   └── config.service.ts
    │   │
    │   ├── database/     # Configuração do banco de dados (TypeORM/Prisma) e entidades.
    │   │   ├── database.module.ts
    │   │   └── entities/
    │   │       ├── champion-stats.entity.ts
    │   │       ├── matchup-stats.entity.ts
    │   │       └── processed-match.entity.ts
    │   │
    │   ├── riot/         # Cliente para a API da Riot Games. Centraliza chamadas e rate limiting.
    │   │   ├── riot.module.ts
    │   │   ├── riot.service.ts
    │   │   └── dto/      # Data Transfer Objects para os dados da API da Riot
    │   │
    │   └── queue/        # Lógica para interagir com o RabbitMQ.
    │       ├── queue.module.ts
    │       └── queue.service.ts # Serviço para publicar mensagens.
    │
    └── modules/          # Módulos específicos para cada um dos nossos serviços.
        ├── api/          # Responsável por expor os dados via HTTP.
        │   ├── api.module.ts
        │   ├── api.controller.ts # Define os endpoints (ex: GET /stats/champions/:id)
        │   └── api.service.ts    # Lógica de negócio para buscar dados no banco.
        │
        ├── collector/    # Responsável por buscar e enfileirar as partidas.
        │   ├── collector.module.ts
        │   └── collector.service.ts # Lógica para buscar high-elo, partidas e publicar na fila.
        │
        └── worker/       # Responsável por processar as partidas da fila.
            ├── worker.module.ts
            └── worker.service.ts # Lógica para consumir mensagens, buscar detalhes e salvar no banco.
```

### Estratégia de Execução

A aplicação única será iniciada em diferentes "modos" com base na variável de ambiente APP_MODE.
`APP_MODE=API`: Inicia o servidor HTTP.
`APP_MODE=WORKER`: Inicia o consumidor da fila RabbitMQ.
`APP_MODE=COLLECTOR`: Executa o processo de coleta como um script único e finaliza.
O docker-compose.yml será configurado para iniciar os contêineres api e worker de forma contínua, enquanto o collector poderá ser executado sob demanda com o comando docker-compose run --rm collector.
Isso signfica que na minha imagem teremos 3 containers diferentes orquestrados pelo docker-compose.yml
