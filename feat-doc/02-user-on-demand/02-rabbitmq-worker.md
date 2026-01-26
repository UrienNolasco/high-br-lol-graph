# Implementação: Filas e Workers

## Contexto
Atualmente temos workers ouvindo a fila do collector. Precisamos que eles priorizem a atualização do usuário.

## Tarefas Técnicas

### 1. Configuração do RabbitMQ
* No módulo `RabbitMqModule`, declarar uma nova fila (Queue) chamada `user-update-queue`.
* Garantir que ela seja durável (durable: true).

### 2. Atualização do Worker Controller
* No `WorkerController` (que já existe), adicionar um novo método consumidor.
* **Decorator:** `@EventPattern('user.update.matches')` (ou o nome da fila configurada).
* **Importante:** Este método deve chamar o **mesmo service** de processamento (`MatchProcessorService`) que a fila normal usa. Não duplique a lógica de salvar no banco!

### 3. Estratégia de Prioridade (Simulada)
* Como o NestJS gerencia conexões, garanta que o listener da `user-update-queue` esteja ativo.
* *Opcional (Avançado):* Configurar o `prefetch_count` para garantir que o worker não fique travado em 100 partidas antigas enquanto o usuário espera.