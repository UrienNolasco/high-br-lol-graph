# Sistema de Rate Limiting com Redis

## Visão Geral

Este projeto implementa um sistema de rate limiting centralizado usando Redis para gerenciar um "pote compartilhado" de 100 requisições por 2 minutos (120 segundos) para a API da Riot Games.

## Arquitetura

### Componentes Principais

1. **RateLimiterService**: O "guardião" central que gerencia o rate limit
2. **Redis**: Banco de dados em memória que armazena o estado compartilhado
3. **RiotService**: Integrado com o RateLimiterService para controlar requisições
4. **Collector/Worker**: Continuam funcionando normalmente, sem saber da complexidade

### Fluxo de Requisição

```
Collector/Worker -> RiotService.getMatchById() -> RateLimiterService.throttle() -> Redis -> Permissão OK -> Chamada HTTP para Riot
```

## Configuração

### Variáveis de Ambiente

Adicione ao seu arquivo `.env`:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Riot Games API
RIOT_API_KEY=your_riot_api_key_here
```

### Docker Compose

O Redis já está configurado no `docker-compose.yml`:

```yaml
redis:
  image: redis:7-alpine
  container_name: high-br-lol-redis
  ports:
    - '6379:6379'
  networks:
    - lol-stats-network
  restart: unless-stopped
```

## Algoritmo de Rate Limiting

### Janela Deslizante (Sliding Window)

O sistema usa um algoritmo de janela deslizante implementado com Redis Sorted Sets:

1. **Registro**: Cada requisição adiciona um timestamp ao Redis
2. **Limpeza**: Remove timestamps mais antigos que 2 minutos
3. **Verificação**: Conta requisições na janela atual
4. **Controle**: Se < 100 requisições, permite; senão, aguarda

### Parâmetros Configuráveis

```typescript
private readonly WINDOW_SIZE_SECONDS = 120; // 2 minutos
private readonly MAX_REQUESTS = 100;        // 100 requisições
private readonly RETRY_DELAY_MS = 1000;     // 1 segundo de espera
```

## APIs Disponíveis

### Endpoint de Status

```http
GET /api/rate-limit/status
```

Retorna:

```json
{
  "requestsInWindow": 45,
  "maxRequests": 100,
  "canProceed": true
}
```

### Endpoint de Reset

```http
GET /api/rate-limit/reset
```

Reseta o rate limit (útil para testes):

```json
{
  "message": "Rate limit tokens resetados com sucesso"
}
```

## Vantagens da Nova Arquitetura

### 1. Dinâmica e Eficiente

- Se o Collector terminar rápido, libera toda a capacidade para o Worker
- Não há desperdício de "quotas" não utilizadas

### 2. Centralizada

- Lógica de rate limit em um único lugar
- Fácil de manter e ajustar parâmetros

### 3. Desacoplada

- Collector e Worker não precisam saber sobre rate limit
- A "magia" acontece transparentemente no RiotService

### 4. Robusta

- Usa Redis para persistência em memória
- Algoritmo de janela deslizante mais preciso que rate limiting simples

## Monitoramento

### Logs

O sistema gera logs detalhados:

```
[RateLimiterService] Conectado ao Redis em localhost:6379
[RateLimiterService] Permissão concedida após 1 tentativa(s) em 0ms. Requisições na janela: 45/100
[RateLimiterService] Rate limit excedido. Tentativa 1. Requisições na janela: 100/100. Aguardando 1000ms...
```

### Métricas

- Número de requisições na janela atual
- Tempo de espera para obter permissão
- Número de tentativas necessárias

## Troubleshooting

### Redis não conecta

- Verifique se o Redis está rodando: `docker-compose ps`
- Confirme as variáveis de ambiente REDIS_HOST e REDIS_PORT

### Rate limit muito restritivo

- Ajuste `MAX_REQUESTS` ou `WINDOW_SIZE_SECONDS` no RateLimiterService
- Monitore os logs para entender o padrão de uso

### Performance

- Redis é extremamente rápido (operações em microssegundos)
- O algoritmo é O(log N) para inserção e O(log N) para limpeza
- Impacto mínimo na performance das requisições

## Testando

Para testar o sistema:

1. Inicie os containers: `docker-compose up`
2. Faça várias requisições simultâneas
3. Monitore os logs e o endpoint `/api/rate-limit/status`
4. Use `/api/rate-limit/reset` para limpar e testar novamente
