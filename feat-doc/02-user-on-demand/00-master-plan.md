# Master Plan: User On-Demand Update & Priority Queue

## 1. O Problema
Atualmente, o sistema é passivo. O usuário entra no app e vê "Dados não encontrados".
Precisamos de um fluxo **Ativo e Prioritário** onde o usuário solicita a sincronização do seu perfil através do Riot ID (`GameName#TagLine`).

## 2. Fluxo da Aplicação
1.  **Mobile:** Envia `POST /players/search` com body `{ gameName: "UrienMano", tagLine: "br1" }`.
2.  **API (Riot Service):**
    * Consulta endpoint `Account V1`.
    * *Cenário A (Sucesso):* Retorna PUUID `BhDoHm...`.
    * *Cenário B (Erro 404):* Retorna `HTTP 404 Player not found`. Aborta fluxo.
3.  **API (Match Logic):**
    * Com o PUUID, busca lista de IDs (Match V5) -> `["BR1_123", "BR1_124"]`.
    * **Diff Check:** Compara com o banco local. Filtra apenas as que **não** existem.
4.  **API (Priority Queue):**
    * Publica os IDs faltantes no RabbitMQ com **Priority = 10 (High)**.
    * *Nota:* Jobs de background normais (crawler) devem ter **Priority = 1 (Low)**.
5.  **API (Response):**
    * Salva/Atualiza o usuário na tabela `Summoner` (ou `Player`).
    * Retorna `200 OK` com status "UPDATING" e quantidade de partidas na fila.

## 3. Requisitos Técnicos
* **RabbitMQ Priority:** Configurar a fila `process-match` para aceitar argumento `x-max-priority`.
* **Rate Limiting:** O endpoint de busca deve ter proteção (ex: 1 request a cada 10s por IP) para não estourar nossa API Key de desenvolvimento com buscas de Account V1.

## 4. Definição de Sucesso
* Busca por "UrienMano#br1" retorna PUUID correto.
* Erro na Riot (404) é repassado corretamente para o Frontend.
* O Worker processa as partidas desse usuário **antes** das partidas que já estavam na fila há 1 hora.