# Master Plan: Atualização de Perfil Sob Demanda (v1.1)

## Objetivo
Permitir que o usuário solicite a atualização dos seus dados recentes. O sistema deve buscar as últimas 20 partidas, filtrar as que já existem no banco e processar apenas as novas com prioridade máxima.

## Arquitetura de Solução
1.  **Entrada:** Endpoint `POST /users/update/:puuid`.
2.  **Verificação:**
    * Consultar API Riot (Match V5) p/ pegar últimos 20 IDs.
    * Consultar PostgreSQL p/ ver quais desses 20 já existem.
    * Calcular o Delta (Novos - Existentes).
3.  **Fila Prioritária:**
    * Se houver Delta, publicar na fila `user-update-queue` (RabbitMQ).
    * Essa fila é distinta da `match-queue` (usada pelo Collector) para garantir Zero-Wait-Time.
4.  **Processamento:**
    * Workers atuais devem assinar também a `user-update-queue`.
    * Lógica de processamento é reutilizada (baixa JSON, salva no banco).

## Regras de Ouro (Constraints)
* **Rate Limit:** Respeitar o limite de 100 req/2min da Personal Key.
* **Idempotência:** Não processar a mesma partida duas vezes.
* **Performance:** O usuário deve ver o resultado em < 30s.