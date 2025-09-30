# TO-DO LIST

## Fundação (Configuração e Conexões)

Objetivo: Ter um projeto NestJS funcional, rodando via Docker Compose, com todos os serviços (Postgres, RabbitMQ, App) se conectando com sucesso.

- [x] Inicializar o Repositório.

- [x] Instalar NestJS CLI: Se não tiver, npm install -g @nestjs/cli.

- [x] Criar o Projeto: nest new high-br-lol-graph.

- [x] Dockerizar: Crie o Dockerfile na raiz do projeto.

- [x] Teste de Orquestração: Rode docker-compose up -d --build. Objetivo: Ver os contêineres postgres, rabbitmq, api e worker subindo e permanecendo em execução sem crashar.

- [x] Criar Módulos Core:
  - [x] Crie o ConfigModule (src/core/config) para carregar as variáveis do .env.

  - [x] Crie o DatabaseModule (src/core/database) para configurar a conexão com o Postgres (usando TypeORM ou Prisma).

  - [x] Crie o QueueModule (src/core/queue) para configurar a conexão com o RabbitMQ.

- [ ] Criar Módulos de Serviço: Crie as pastas e os arquivos .module.ts para api, collector e worker dentro de src/modules.

- [ ] Integrar Módulo Raiz: Importe todos os módulos criados (core e de serviço) no AppModule (src/app.module.ts).

- [ ] Validar Conexões: Adicione logs na inicialização para confirmar que a aplicação se conectou com sucesso ao Postgres e ao RabbitMQ.

Resultado: projeto "vazio" porém 100% funcional em termos de infraestrutura.

## Coração do Processamento (Foco no Worker)

Objetivo: Ter um worker capaz de consumir uma mensagem da fila, buscar os dados da partida na Riot API, calcular as estatísticas e salvá-las no banco de dados.

- [ ] Definir Entidades do Banco: Crie os arquivos de entidade/modelo para ProcessedMatch, ChampionStats e MatchupStats em src/core/database/entities.

- [ ] Criar Cliente da Riot API: No RiotModule (src/core/riot), crie o RiotService e implemente o primeiro método: getMatchById(matchId: string).

- [ ] Implementar Lógica do Worker:

No WorkerService, crie o método principal, ex: processMatch(payload: { matchId: string, patch: string }).

Dentro dele, chame o RiotService para buscar os dados da partida.

Implemente a lógica para identificar os times, o vencedor e os campeões em cada rota.

- [ ] Implementar Cálculos e Persistência:

Adicione a lógica que atualiza as tabelas champion_stats e matchup_stats. (Dica: Use INSERT ... ON CONFLICT ... DO UPDATE do SQL para facilitar a atualização).

Insira um registro na tabela processed_matches.

- [ ] Conectar Worker à Fila: Configure o WorkerService para ouvir uma fila específica no RabbitMQ (ex: matches_to_process).

- [ ] Teste de Ponta a Ponta (Manual):

Acesse a interface do RabbitMQ em http://localhost:15672.

Envie manualmente uma mensagem para a fila matches_to_process com um JSON contendo um ID de partida real, ex: { "matchId": "BR1_12345678", "patch": "15.20" }.

Observe os logs do contêiner worker (docker-compose logs -f worker).

Verifique se os dados foram inseridos/atualizados corretamente no banco de dados.

Resultado ao final da Sprint: O cérebro do seu sistema está pronto.

## A Fonte dos Dados (Foco no Collector)

Objetivo: Ter um collector que busca novas partidas de jogadores high-elo e as publica na fila para o Worker processar.

- [ ] Expandir Cliente da Riot API: Adicione os métodos necessários ao RiotService: getHighEloPlayers() (para buscar as ligas Challenger, GM, etc.) e getMatchHistoryByPuuid().

- [ ] Implementar Lógica do Coletor:

No CollectorService, crie o método principal runCollection().

Dentro dele, implemente o fluxo: buscar jogadores -> para cada jogador, buscar histórico de partidas.

- [ ] Implementar Filtro de Duplicidade: Para cada matchId encontrado, faça uma consulta no banco na tabela processed_matches para garantir que ele ainda não foi processado no patch atual.

- [ ] Implementar Publicação na Fila: Se a partida for nova, chame o QueueService para publicar a mensagem na fila matches_to_process.

- [ ] Teste de Integração:

Execute o Coletor manualmente com docker-compose run --rm collector.

Observe a interface do RabbitMQ para ver as mensagens sendo enfileiradas.

Observe os logs do worker para confirmar que ele está consumindo e processando as novas mensagens.

Resultado ao final da Sprint: Seu pipeline de dados está completo e autônomo.

## A Vitrine (Foco na API)

Objetivo: Expor os dados agregados através de endpoints HTTP.

- [ ] Implementar Lógica de Consulta: No ApiService, crie os métodos que farão as consultas no banco de dados. Ex: getStatsForChampion(championId, patch), getStatsForMatchup(champion1, champion2, patch).

- [ ] Criar os Controladores: No ApiController, defina os endpoints RESTful:

GET /stats/champions/:championName

GET /stats/matchups/:champion1/:champion2

- [ ] Adicionar Validação: Use DTOs (Data Transfer Objects) e ValidationPipes do NestJS para validar os parâmetros de rota e query (ex: garantir que patch seja informado).

- [ ] Testar os Endpoints: Use uma ferramenta como Postman, Insomnia ou curl para fazer requisições à sua API (http://localhost:3000) e validar se os resultados em JSON estão corretos.

Resultado ao final da Sprint: Você pode finalmente ver e usar os frutos do seu trabalho!
