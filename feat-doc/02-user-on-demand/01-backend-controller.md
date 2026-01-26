# Implementação: User Controller & Service

## Contexto

O usuário final enviará seu Riot ID (Ex: "UrienMano#br1"). Precisamos converter isso para PUUID antes de qualquer operação de busca de partidas.

## Tarefas Técnicas

### 1. Novo Endpoint de Busca/Atualização

- **Rota:** `POST /api/v1/users/update`
- **Body:**
  ```json
  {
    "gameName": "UrienMano",
    "tagLine": "br1",
    "region": "br1" // opcional, default br1
  }
  ```

### 2. Lógica do Service (`UsersService`)

#### Passo A: Resolução de Identidade (Crucial)

1.  Receber `gameName` e `tagLine`.
2.  Chamar `RiotApiService.getAccountByRiotId(gameName, tagLine)`.
    - _Endpoint Riot:_ `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`
3.  Guardar o `puuid` retornado.
4.  _Opcional:_ Salvar/Atualizar esse usuário na sua tabela `User` local (Upsert) para cachear o PUUID e não gastar requisição de Account-V1 na próxima vez.

#### Passo B: Busca de Partidas (Lógica Existente)

1.  Com o `puuid` em mãos, chamar `RiotApiService.getMatchIdsByPuuid(puuid, count=20)`.
2.  Consultar banco local (`PrismaService.match.findMany`) filtrando pelos IDs retornados.
3.  Calcular Delta: `missingIds = riotIds.filter(id => !dbIds.includes(id))`.

#### Passo C: Envio para Fila

1.  Se `missingIds.length > 0`:
    - Chamar `RabbitMqService.sendToUserQueue(missingIds)`.

### 3. Retorno para o Frontend

- O retorno deve conter o `puuid` (para o front usar em consultas futuras e economizar chamadas) e o status.
  ```json
  {
    "puuid": "u6xZ_...",
    "status": "processing",
    "new_matches": 5
  }
  ```
