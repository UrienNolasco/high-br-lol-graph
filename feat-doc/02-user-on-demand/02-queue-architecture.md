*A implementação técnica da Fila Prioritária.*

```markdown
# Arquitetura de Filas: Priority Queue Strategy

Para garantir que o usuário que acabou de clicar em "Atualizar" seja atendido imediatamente, não podemos usar uma fila FIFO (First-In-First-Out) simples.

## Estratégia: RabbitMQ Priority Queues

Em vez de criar filas separadas (que complexificam o Worker), usaremos o recurso nativo de prioridade do RabbitMQ.

### 1. Configuração da Fila (Setup)
Ao declarar a fila no `CollectorService` (ou no módulo do RabbitMQ), precisamos adicionar o argumento `x-max-priority`.

```typescript
// Exemplo de configuração no NestJS / amqplib
channel.assertQueue('process-match', {
  durable: true,
  maxPriority: 10 // Define que a fila suporta prioridade de 0 a 10
});
2. Publicação (Producer)
O CollectorService terá dois métodos de publicação:

A. publishUserRequestedMatch(matchId: string)
Usado pelo endpoint /players/search.

Priority: 10 (Máxima).

Comportamento: O Worker vai pegar essa mensagem antes de qualquer outra com prioridade menor.

B. publishBackgroundMatch(matchId: string)
Usado pelo Crawler automático ou atualizações periódicas.

Priority: 1 (Baixa).

Comportamento: Só é processado se não houver nenhuma prioridade 10 na fila.

3. Consumo (Worker)
O Worker não muda. Ele continua consumindo da mesma fila. O RabbitMQ gerencia a ordem de entrega magicamente. Isso mantém a arquitetura do Worker limpa e desacoplada da lógica de prioridade.