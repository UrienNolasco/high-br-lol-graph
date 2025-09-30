# Detalhamento do Fluxo em Etapas

## Etapa 1: Carregar Dados Estáticos

Antes de qualquer coleta, o sistema deve garantir que tem a versão mais recente do arquivo champion.json do DDragon. Esse arquivo é essencial para traduzir os championId (ex: 238) recebidos da API em nomes legíveis (ex: "Zed").

## Etapa 2: Obter Lista de Jogadores High-Elo

Serviço Responsável: CollectorService

Endpoints da API: LEAGUE-V4

- GET /lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5

- GET /lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5

- GET /lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5

Saída: Uma lista unificada de todos os jogadores desses três tiers, contendo o summonerId de cada um.

Ação: Combinar os resultados das três chamadas em uma única lista de jogadores a serem investigados.

## Etapa 3: Obter PUUID de Cada Jogador

Serviço Responsável: CollectorService

Endpoint da API: GET /lol/summoner/v4/summoners/{encryptedSummonerId}

Entrada: O summonerId de cada jogador obtido na Etapa 2.

Saída: O objeto de dados do invocador (SummonerDTO), que contém o puuid.

Ação: Iterar sobre a lista de jogadores e fazer uma chamada para este endpoint para cada um, armazenando seus puuid.

## Etapa 4: Obter Histórico de Partidas Recentes

Serviço Responsável: CollectorService

Endpoint da API: GET /lol/match/v5/matches/by-puuid/{puuid}/ids

Entrada: O puuid de cada jogador obtido na Etapa 3.

Saída: Uma lista de strings, onde cada string é um matchId (ex: ["BR1_...", "BR1_..."]).

Ação: Coletar as listas de IDs de partidas para todos os jogadores.

## Etapa 5: Filtrar e Enfileirar Partidas para Processamento

Serviço Responsável: CollectorService

Ação Interna: Esta é a etapa crucial que conecta a coleta ao processamento.

Crie um conjunto (Set) com todos os matchId únicos coletados na Etapa 4 para evitar duplicatas na própria coleta.

Para cada matchId único, consulte a sua tabela processed_matches no PostgreSQL.

SE o matchId NÃO existir no seu banco, crie um objeto ProcessMatchDto (ex: { matchId: "BR1\_...", patch: "15.20" }).

Publique este objeto na fila do RabbitMQ.

Saída: A fila do RabbitMQ é populada com as tarefas para o Worker.

```bash
<<<<< Transferência de Responsabilidade: do Collector para o Worker >>>>>
```

## Etapa 6: Consumir Mensagem da Fila

erviço Responsável: WorkerService

Ação Interna: O WorkerService está constantemente ouvindo a fila. Quando uma nova mensagem (ProcessMatchDto) chega, ele a consome e inicia o trabalho.

## Etapa 7: Obter Detalhes Completos da Partida

Serviço Responsável: WorkerService

Endpoint da API: GET /lol/match/v5/matches/{matchId}

Entrada: O matchId obtido da mensagem da fila.

Saída: Um objeto JSON gigante com todos os dados da partida (informações dos participantes, estatísticas, itens, e o campo "win": true/false).

Ação: Passar este objeto JSON para a lógica de cálculo.

## Etapa 8: Processar, Calcular e Persistir Dados

Serviço Responsável: WorkerService

Ação Interna: Esta é a etapa final do ciclo de vida de uma partida.

Parsear os Dados: Extrair as informações relevantes do JSON da partida.

Atualizar Estatísticas: Para cada participante da partida, atualizar as tabelas agregadas no PostgreSQL (champion_stats e matchup_stats), incrementando os contadores de jogos e vitórias.

Marcar como Concluído: Inserir o matchId na tabela processed_matches para garantir que esta partida nunca mais seja processada.
