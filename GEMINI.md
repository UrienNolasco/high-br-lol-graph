# high-br-lol-graph

### Project Overview and Objectives

`high-br-lol-graph` is a personal learning project I am developing to understand how to work with external APIs that deliver large volumes of data, where various analytical calculations will be performed on this data. I will do this by processing and analyzing League of Legends match statistics through Riot Games' official DRAGON API.

- Main Objective: Calculate champion win rates and analyze favorable and unfavorable direct matchups.

- Data Scope: The analysis will be focused exclusively on high-elo players (Master, Grandmaster, Challenger) from the Brazilian server (BR).

- Granularity: The system will focus on the final match result (win/loss) and the champions involved. Details such as item builds, runes, or match timeline data are out of scope.

- Key Requirement: All statistics must be segmented by game patch to allow meta analyses.

- Update Model: Data will be updated in batches, with daily frequency being sufficient.

- Budget and Deployment: The project has a budget of R$ 0.00 and will run entirely in a local development environment, with no need for production deployment. However, it will be container-oriented to simulate a production environment.

### System Architecture

The chosen architecture is a decoupled, event-driven data pipeline implemented in a monorepo. Orchestration of all services will be done locally via Docker Compose.

#### Data Flow

The data flow follows a clear pattern of separated responsibilities to ensure resilience and maintainability.

```bash
[1. Collector] -> [2. Message Queue] -> [3. Worker] -> [4. Database] <- [5. API]
```

- Collector: A batch process that fetches new match IDs from Riot's API and publishes them to the message queue.
- Message Queue: Acts as a buffer, decoupling the Collector from the Worker. Ensures no match is lost if the worker is slow or offline.
- Worker: A service that consumes messages from the queue, fetches full match details, performs calculations, and updates the statistics tables in the database.
- Database: Stores both raw data (which matches were processed) and aggregated data (calculated statistics).
- API: An HTTP server that exposes pre-calculated data from the database for querying. It does not perform heavy calculations.

### Technology Stack

- Local Orchestration: Docker & Docker Compose
- Language & Framework: Node.js with NestJS & TypeScript
- Database: PostgreSQL
- Message Queue: RabbitMQ
- Scalar for API documentation
- typeorm

### Error Handling and Resilience

The system implements a robust error handling strategy to ensure stability and reliability when working with external APIs and processing large volumes of data.

#### Error Handling Architecture

**1. Centralized HTTP Error Interceptor**

- Located in `RiotModule`, the interceptor automatically captures all HTTP errors from Riot Games API
- Maps HTTP status codes to specific NestJS exceptions
- Detailed logging for debugging and monitoring

**2. Status Code Mapping**

```typescript
400 → BadRequestException      // Invalid data sent
401 → UnauthorizedException    // Invalid or expired API key
403 → ForbiddenException       // Access denied to API
404 → NotFoundException        // Resource not found
429 → HttpException            // Rate limit exceeded
500 → InternalServerErrorException // Riot internal error
502/503 → ServiceUnavailableException // API unavailable
504 → GatewayTimeoutException  // API timeout
```

**3. Configuration Validation**

- Mandatory validation of `RIOT_API_KEY` variable at startup
- Fast failure if essential configurations are missing
- Type safety guaranteed to avoid runtime errors

**4. Recovery Strategies**

- **Rate Limiting**: Warning logs for monitoring, prepared for retry logic implementation
- **Timeouts**: Configured for 5 seconds, preventing hangs
- **Network Errors**: Specific handling for connectivity issues
- **API Failures**: Appropriate exception propagation to upper layers

**5. Structured Logging**

- Error logs with complete context (URL, status, response data)
- Stack traces for debugging network issues
- Warning logs for situations requiring attention (rate limiting)

**6. Approach Benefits**

- **Decoupling**: Services focus on business logic, not HTTP error handling
- **Consistency**: All API errors are handled uniformly
- **Observability**: Detailed logs facilitate debugging and monitoring
- **Maintainability**: Centralization facilitates future changes and improvements
- **Type Safety**: Validations ensure code robustness at runtime

**Error Handling Flow:**

```
[Service] → [HttpService] → [Axios] → [Riot API]
                  ↓
              [Interceptor]
                  ↓
          [Error Classification]
                  ↓
       [NestJS Exception] → [Logging] → [Error Response]
```

**Usage Example:**

```typescript
// Services don't need to worry about try-catch
async getMatchById(matchId: string): Promise<MatchDto> {
  const response = await firstValueFrom(
    this.httpService.get<MatchDto>(url, { headers: this.createHeaders() })
  );
  return response.data; // If there's an error, the interceptor handles it automatically
}
```

### Project Folder Structure:

```bash
high-br-lol-graph/
├── .env                  # Environment variables (DO NOT COMMIT TO GIT)
├── .env.example          # Example environment variables
├── .gitignore            # Files and folders to ignore by Git
├── docker-compose.yml    # Orchestrates containers (Postgres, RabbitMQ, App)
├── Dockerfile            # Recipe to build the application image
├── nest-cli.json         # NestJS CLI configuration
├── package.json          # Project dependencies and scripts
├── README.md             # Project documentation
├── tsconfig.build.json   # TypeScript build configuration
├── tsconfig.json         # Main TypeScript configuration
└── src/                  # The heart of the application
    ├── main.ts           # Application entry point. Decides which service to start.
    ├── app.module.ts     # Root module tying everything together.
    │
    ├── core/             # Shared logic and modules across all services.
    │   ├── config/       # Module to manage environment variables (@nestjs/config)
    │   │   ├── config.module.ts
    │   │   └── config.service.ts
    │   │
    │   ├── database/     # Database configuration (TypeORM/Prisma) and entities.
    │   │   ├── database.module.ts
    │   │   └── entities/
    │   │       ├── champion-stats.entity.ts
    │   │       ├── matchup-stats.entity.ts
    │   │       └── processed-match.entity.ts
    │   │
    │   ├── riot/         # Riot Games API client. Centralizes calls and rate limiting.
    │   │   ├── riot.module.ts
    │   │   ├── riot.service.ts
    │   │   └── dto/      # Data Transfer Objects for Riot API data
    │   │
    │   └── queue/        # Logic for interacting with RabbitMQ.
    │       ├── queue.module.ts
    │       └── queue.service.ts # Service for publishing messages.
    │
    └── modules/          # Specific modules for each service.
        ├── api/          # Responsible for exposing data via HTTP.
        │   ├── api.module.ts
        │   ├── api.controller.ts # Defines endpoints (e.g., GET /stats/champions/:id)
        │   └── api.service.ts    # Business logic for querying the database.
        │
        ├── collector/    # Responsible for fetching and enqueuing matches.
        │   ├── collector.module.ts
        │   └── collector.service.ts # Logic to fetch high-elo matches and publish to the queue.
        │
        └── worker/       # Responsible for processing matches from the queue.
            ├── worker.module.ts
            └── worker.service.ts # Logic to consume messages, fetch details, and save to the database.
```

### Execution Strategy

The single application will be started in different "modes" based on the environment variable APP_MODE.
`APP_MODE=API`: Starts the HTTP server.

`APP_MODE=WORKER`: Starts the RabbitMQ queue consumer.

`APP_MODE=COLLECTOR`: Runs the collection process as a one-off script and exits.

The docker-compose.yml will be configured to continuously start the api and worker containers, while the collector can be run on-demand using `docker-compose run --rm collector`.

This means the image will have 3 different containers orchestrated by docker-compose.yml
