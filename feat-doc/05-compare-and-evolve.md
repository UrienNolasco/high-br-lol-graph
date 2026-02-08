# Feature 05: Compare & Evolve

## Visão Geral

Comparação avançada entre dois jogadores (hero vs villain) com métricas de laning phase, gráficos de linha sobrepostos e insights automáticos. Foco em mostrar **diferenças de skill** e **áreas de melhoria**.

---

## Endpoint

### GET /api/v1/analytics/compare

**Descrição:** Comparação detalhada entre dois jogadores (ex: você vs Faker).

**Query Params (REQUIRED):**
- `heroPuuid`: PUUID do jogador principal (você)
- `villainPuuid`: PUUID do jogador para comparar (Faker)

**Query Params (OPTIONAL):**
- `role` (optional): Filtrar apenas jogos nessa role (MID, TOP, JUNGLE, BOTTOM, UTILITY)
- `championId` (optional): Filtrar apenas esse campeão
- `patch` (optional): "15.19" | "lifetime" (default: "lifetime")

**Response:**
```json
{
  "hero": {
    "puuid": "abc123",
    "gameName": "Player1",
    "stats": {
      "gamesPlayed": 150,
      "winRate": 60.0,
      "avgKda": 3.8,
      "avgCspm": 8.1,
      "avgDpm": 720.5,
      "avgGpm": 450.2,
      "avgVisionScore": 25.5
    },
    "laningPhase": {
      "avgCsd15": 5.3,
      "avgGd15": 320.5,
      "avgXpd15": 150.2,
      "soloKills15": 0.4,
      "soloDeaths15": 0.6
    }
  },
  "villain": {
    "puuid": "xyz789",
    "gameName": "Faker",
    "stats": {
      "gamesPlayed": 300,
      "winRate": 65.0,
      "avgKda": 4.5,
      "avgCspm": 9.2,
      "avgDpm": 850.3,
      "avgGpm": 480.5,
      "avgVisionScore": 30.2
    },
    "laningPhase": {
      "avgCsd15": 12.8,
      "avgGd15": 550.3,
      "avgXpd15": 280.5,
      "soloKills15": 0.8,
      "soloDeaths15": 0.2
    }
  },
  "timelineComparison": {
    "csGraph": {
      "hero": [
        { "minute": 0, "value": 0 },
        { "minute": 5, "value": 40 },
        { "minute": 10, "value": 80 },
        { "minute": 15, "value": 120 },
        { "minute": 20, "value": 160 },
        { "minute": 30, "value": 240 }
      ],
      "villain": [
        { "minute": 0, "value": 0 },
        { "minute": 5, "value": 46 },
        { "minute": 10, "value": 95 },
        { "minute": 15, "value": 145 },
        { "minute": 20, "value": 185 },
        { "minute": 30, "value": 270 }
      ]
    },
    "goldGraph": {
      "hero": [
        { "minute": 0, "value": 500 },
        { "minute": 5, "value": 2500 },
        { "minute": 10, "value": 4500 },
        { "minute": 15, "value": 7000 },
        { "minute": 20, "value": 9000 },
        { "minute": 30, "value": 14000 }
      ],
      "villain": [
        { "minute": 0, "value": 500 },
        { "minute": 5, "value": 2800 },
        { "minute": 10, "value": 5200 },
        { "minute": 15, "value": 8000 },
        { "minute": 20, "value": 10500 },
        { "minute": 30, "value": 16000 }
      ]
    }
  },
  "insights": {
    "winner": "villain",
    "advantages": [
      "villain has 13.6% higher CS/min (9.2 vs 8.1)",
      "villain has 141% advantage in CSD@15 (12.8 vs 5.3)",
      "villain has better vision control (30.2 vs 25.5 vision score)",
      "hero has better survival rate in lane (0.6 vs 0.2 solo deaths @15)"
    ],
    "recommendations": [
      "Focus on improving CS in lane phase (first 15min)",
      "Ward more frequently (current: 25.5, target: 30+)",
      "Practice wave management to increase gold lead @15"
    ]
  }
}
```

---

## Schema (Já Definidos)

### PlayerStats
```prisma
model PlayerStats {
  id              Int       @id @default(autoincrement())
  puuid           String
  patch           String?
  queueId         Int       @default(420)

  gamesPlayed     Int       @default(0)
  wins            Int       @default(0)
  winRate         Float     @default(0)
  avgKda          Float     @default(0)
  avgDpm          Float     @default(0)
  avgCspm         Float     @default(0)
  avgGpm          Float     @default(0)
  avgVisionScore  Float     @default(0)

  @@unique([puuid, patch, queueId])
  @@map("player_stats")
}
```

### PlayerChampionStats
```prisma
model PlayerChampionStats {
  id              Int       @id @default(autoincrement())
  puuid           String
  championId      Int
  patch           String?
  queueId         Int       @default(420)

  gamesPlayed     Int       @default(0)
  winRate         Float     @default(0)
  avgKda          Float     @default(0)
  avgDpm          Float     @default(0)
  avgCspm         Float     @default(0)
  avgGpm          Float     @default(0)
  avgVisionScore  Float     @default(0)
  avgCsd15        Float     @default(0)
  avgGd15         Float     @default(0)
  avgXpd15        Float     @default(0)

  @@unique([puuid, championId, patch, queueId])
  @@map("player_champion_stats")
}
```

---

## Fluxo de Dados

```
Request: GET /api/v1/analytics/compare?heroPuuid=abc&villainPuuid=xyz&role=MID
  ↓
ApiController.comparePlayerPerformance(query)
  ↓
ApiService.comparePlayerPerformance(heroPuuid, villainPuuid, filters):
  ├─ 1. Buscar User de ambos (para gameName)
  ├─ 2. Se championId: usar PlayerChampionStats
  │    Senão: usar PlayerStats
  ├─ 3. Para Timeline Comparison:
  │    ├─ Buscar TODAS partidas de ambos (com filtros)
  │    ├─ Para cada minuto (0-40):
  │    │    ├─ Calcular MÉDIA de csGraph[minute]
  │    │    └─ Calcular MÉDIA de goldGraph[minute]
  │    └─ Formatar como arrays de { minute, value }
  ├─ 4. Calcular laning metrics (solo kills/deaths @15)
  └─ 5. Gerar insights automáticos (comparações e recomendações)
  ↓
Response: ComparisonDto
```

---

## Implementação (ApiService)

### Estrutura Principal

```typescript
async comparePlayerPerformance(
  heroPuuid: string,
  villainPuuid: string,
  filters: {
    role?: string;
    championId?: number;
    patch?: string;
  }
): Promise<PlayerComparisonDto> {
  const patch = filters.patch === 'lifetime' || !filters.patch ? null : filters.patch;

  // 1. Buscar nomes dos jogadores
  const [hero, villain] = await Promise.all([
    this.prisma.user.findUnique({ where: { puuid: heroPuuid } }),
    this.prisma.user.findUnique({ where: { puuid: villainPuuid } })
  ]);

  if (!hero || !villain) {
    throw new NotFoundException('One or both players not found');
  }

  // 2. Buscar stats agregados
  let heroStats, villainStats;
  if (filters.championId) {
    // Usar PlayerChampionStats
    [heroStats, villainStats] = await Promise.all([
      this.getPlayerChampionStatsForComparison(heroPuuid, filters.championId, patch),
      this.getPlayerChampionStatsForComparison(villainPuuid, filters.championId, patch)
    ]);
  } else {
    // Usar PlayerStats
    [heroStats, villainStats] = await Promise.all([
      this.getPlayerStatsForComparison(heroPuuid, patch),
      this.getPlayerStatsForComparison(villainPuuid, patch)
    ]);
  }

  // 3. Calcular timeline comparison (média de todas as partidas)
  const timelineComparison = await this.calculateTimelineComparison(
    heroPuuid,
    villainPuuid,
    filters
  );

  // 4. Calcular laning metrics (@15min solo kills/deaths)
  const [heroLaning, villainLaning] = await Promise.all([
    this.calculateLaningMetrics(heroPuuid, filters),
    this.calculateLaningMetrics(villainPuuid, filters)
  ]);

  // 5. Gerar insights
  const insights = this.generateInsights(
    { ...heroStats, ...heroLaning },
    { ...villainStats, ...villainLaning }
  );

  return {
    hero: {
      puuid: heroPuuid,
      gameName: `${hero.gameName}#${hero.tagLine}`,
      stats: heroStats,
      laningPhase: heroLaning
    },
    villain: {
      puuid: villainPuuid,
      gameName: `${villain.gameName}#${villain.tagLine}`,
      stats: villainStats,
      laningPhase: villainLaning
    },
    timelineComparison,
    insights
  };
}
```

### Buscar Stats Agregados

```typescript
private async getPlayerStatsForComparison(puuid: string, patch: string | null) {
  const stats = await this.prisma.playerStats.findUnique({
    where: {
      puuid_patch_queueId: {
        puuid,
        patch,
        queueId: 420
      }
    }
  });

  if (!stats) {
    throw new NotFoundException(`No stats found for ${puuid}`);
  }

  return {
    gamesPlayed: stats.gamesPlayed,
    winRate: stats.winRate,
    avgKda: stats.avgKda,
    avgCspm: stats.avgCspm,
    avgDpm: stats.avgDpm,
    avgGpm: stats.avgGpm,
    avgVisionScore: stats.avgVisionScore
  };
}

private async getPlayerChampionStatsForComparison(
  puuid: string,
  championId: number,
  patch: string | null
) {
  const stats = await this.prisma.playerChampionStats.findUnique({
    where: {
      puuid_championId_patch_queueId: {
        puuid,
        championId,
        patch,
        queueId: 420
      }
    }
  });

  if (!stats) {
    throw new NotFoundException(`No stats found for ${puuid} on champion ${championId}`);
  }

  return {
    gamesPlayed: stats.gamesPlayed,
    winRate: stats.winRate,
    avgKda: stats.avgKda,
    avgCspm: stats.avgCspm,
    avgDpm: stats.avgDpm,
    avgGpm: stats.avgGpm,
    avgVisionScore: stats.avgVisionScore
  };
}
```

### Calcular Timeline Comparison (Média de Partidas)

```typescript
private async calculateTimelineComparison(
  heroPuuid: string,
  villainPuuid: string,
  filters: { role?: string; championId?: number; patch?: string }
) {
  // Buscar TODAS as partidas de ambos com filtros
  const [heroMatches, villainMatches] = await Promise.all([
    this.getPlayerMatchesForTimeline(heroPuuid, filters),
    this.getPlayerMatchesForTimeline(villainPuuid, filters)
  ]);

  // Calcular médias de CS e Gold por minuto
  const heroCs = this.calculateAverageTimeline(heroMatches, 'csGraph');
  const villainCs = this.calculateAverageTimeline(villainMatches, 'csGraph');

  const heroGold = this.calculateAverageTimeline(heroMatches, 'goldGraph');
  const villainGold = this.calculateAverageTimeline(villainMatches, 'goldGraph');

  return {
    csGraph: {
      hero: heroCs,
      villain: villainCs
    },
    goldGraph: {
      hero: heroGold,
      villain: villainGold
    }
  };
}

private async getPlayerMatchesForTimeline(
  puuid: string,
  filters: { role?: string; championId?: number; patch?: string }
) {
  const where: any = {
    puuid,
    match: { queueId: 420 }
  };

  if (filters.championId) {
    where.championId = filters.championId;
  }

  if (filters.role) {
    where.role = filters.role;
  }

  if (filters.patch && filters.patch !== 'lifetime') {
    where.match.gameVersion = { startsWith: filters.patch };
  }

  return this.prisma.matchParticipant.findMany({
    where,
    select: {
      csGraph: true,
      goldGraph: true,
      match: {
        select: { gameDuration: true }
      }
    },
    take: 100  // Limitar para performance (últimas 100 partidas)
  });
}

private calculateAverageTimeline(
  matches: Array<{ csGraph: number[]; goldGraph: number[] }>,
  field: 'csGraph' | 'goldGraph'
): Array<{ minute: number; value: number }> {
  if (matches.length === 0) {
    return [];
  }

  // Determinar duração máxima
  const maxMinutes = Math.max(...matches.map(m => m[field].length));

  // Calcular média por minuto
  const averages = [];
  for (let minute = 0; minute < maxMinutes; minute++) {
    const values = matches
      .map(m => m[field][minute] || 0)
      .filter(v => v > 0);

    const average = values.length > 0
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : 0;

    averages.push({
      minute,
      value: Math.round(average)
    });
  }

  return averages;
}
```

### Calcular Laning Metrics (@15min)

```typescript
private async calculateLaningMetrics(
  puuid: string,
  filters: { role?: string; championId?: number; patch?: string }
) {
  // Buscar partidas com timeline
  const matches = await this.getPlayerMatchesForTimeline(puuid, filters);

  if (matches.length === 0) {
    return {
      avgCsd15: 0,
      avgGd15: 0,
      avgXpd15: 0,
      soloKills15: 0,
      soloDeaths15: 0
    };
  }

  // Para cada partida, pegar valores @15min
  // Nota: CSD@15, GD@15, XPD@15 já estão pré-calculados em PlayerChampionStats
  // Aqui vamos buscar de lá se disponível, senão calcular na hora

  // Se temos championId, buscar de PlayerChampionStats
  if (filters.championId) {
    const stats = await this.prisma.playerChampionStats.findUnique({
      where: {
        puuid_championId_patch_queueId: {
          puuid,
          championId: filters.championId,
          patch: filters.patch === 'lifetime' ? null : filters.patch,
          queueId: 420
        }
      }
    });

    if (stats) {
      return {
        avgCsd15: stats.avgCsd15,
        avgGd15: stats.avgGd15,
        avgXpd15: stats.avgXpd15,
        soloKills15: 0, // TODO: calcular se necessário
        soloDeaths15: 0 // TODO: calcular se necessário
      };
    }
  }

  // Fallback: calcular média manualmente (simplified)
  return {
    avgCsd15: 0,
    avgGd15: 0,
    avgXpd15: 0,
    soloKills15: 0,
    soloDeaths15: 0
  };
}
```

### Gerar Insights Automáticos

```typescript
private generateInsights(heroStats: any, villainStats: any) {
  const advantages: string[] = [];
  const recommendations: string[] = [];

  // Comparar métricas
  const cspmDiff = villainStats.avgCspm - heroStats.avgCspm;
  const cspmDiffPercent = (cspmDiff / heroStats.avgCspm) * 100;

  if (cspmDiffPercent > 10) {
    advantages.push(
      `villain has ${cspmDiffPercent.toFixed(1)}% higher CS/min (${villainStats.avgCspm.toFixed(1)} vs ${heroStats.avgCspm.toFixed(1)})`
    );
    recommendations.push('Focus on improving CS in lane phase (first 15min)');
  } else if (cspmDiffPercent < -10) {
    advantages.push(
      `hero has ${Math.abs(cspmDiffPercent).toFixed(1)}% higher CS/min (${heroStats.avgCspm.toFixed(1)} vs ${villainStats.avgCspm.toFixed(1)})`
    );
  }

  // CSD@15
  const csd15Diff = villainStats.avgCsd15 - heroStats.avgCsd15;
  if (Math.abs(csd15Diff) > 3) {
    const winner = csd15Diff > 0 ? 'villain' : 'hero';
    const winnerValue = csd15Diff > 0 ? villainStats.avgCsd15 : heroStats.avgCsd15;
    const loserValue = csd15Diff > 0 ? heroStats.avgCsd15 : villainStats.avgCsd15;
    const percent = loserValue !== 0 ? ((winnerValue - loserValue) / Math.abs(loserValue)) * 100 : 0;

    advantages.push(
      `${winner} has ${percent.toFixed(0)}% advantage in CSD@15 (${winnerValue.toFixed(1)} vs ${loserValue.toFixed(1)})`
    );

    if (winner === 'villain') {
      recommendations.push('Practice wave management to increase gold lead @15');
    }
  }

  // Vision Score
  const visionDiff = villainStats.avgVisionScore - heroStats.avgVisionScore;
  if (Math.abs(visionDiff) > 5) {
    const winner = visionDiff > 0 ? 'villain' : 'hero';
    const winnerValue = visionDiff > 0 ? villainStats.avgVisionScore : heroStats.avgVisionScore;
    const loserValue = visionDiff > 0 ? heroStats.avgVisionScore : villainStats.avgVisionScore;

    advantages.push(
      `${winner} has better vision control (${winnerValue.toFixed(1)} vs ${loserValue.toFixed(1)} vision score)`
    );

    if (winner === 'villain') {
      recommendations.push(`Ward more frequently (current: ${heroStats.avgVisionScore.toFixed(1)}, target: ${villainStats.avgVisionScore.toFixed(0)}+)`);
    }
  }

  // KDA
  const kdaDiff = villainStats.avgKda - heroStats.avgKda;
  if (Math.abs(kdaDiff) > 0.5) {
    const winner = kdaDiff > 0 ? 'villain' : 'hero';
    if (winner === 'hero' && heroStats.winRate < villainStats.winRate) {
      advantages.push(
        `hero has better KDA but lower winrate - focus on objectives over kills`
      );
      recommendations.push('Translate KDA advantage into objective control');
    }
  }

  // Determinar vencedor geral (por winrate)
  const winner = villainStats.winRate > heroStats.winRate ? 'villain' : 'hero';

  return {
    winner,
    advantages,
    recommendations
  };
}
```

---

## Performance Considerations

### 1. Timeline Aggregation é PESADA

**Problema:**
- Buscar 100 partidas × 2 jogadores = 200 queries
- Cada partida tem goldGraph/csGraph arrays (~40 valores)
- Total: ~16,000 valores para processar

**Soluções:**
1. **Limitar a 50-100 últimas partidas** por jogador
2. **Cache Redis** com TTL de 1 hora:
   ```typescript
   const cacheKey = `compare:${heroPuuid}:${villainPuuid}:${filters}`;
   const cached = await redis.get(cacheKey);
   if (cached) return JSON.parse(cached);
   ```
3. **Background job** para pré-calcular comparações populares (você vs top players)

### 2. Query Optimization

```sql
-- Usar SELECT específico ao invés de SELECT *
SELECT "csGraph", "goldGraph", "gameDuration"
FROM match_participants
WHERE puuid = 'abc123'
  AND ...
LIMIT 100;

-- Índice composto para performance
CREATE INDEX idx_match_participants_puuid_championId_role
  ON match_participants(puuid, "championId", role)
  INCLUDE ("csGraph", "goldGraph");
```

---

## DTOs

### ComparisonQueryDto

```typescript
import { IsString, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ComparisonQueryDto {
  @ApiProperty({ description: 'Hero player PUUID', example: 'abc123' })
  @IsString()
  heroPuuid: string;

  @ApiProperty({ description: 'Villain player PUUID', example: 'xyz789' })
  @IsString()
  villainPuuid: string;

  @ApiProperty({ required: false })
  @IsOptional()
  role?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  championId?: number;

  @ApiProperty({ required: false, default: 'lifetime' })
  @IsOptional()
  patch?: string = 'lifetime';
}
```

### PlayerComparisonDto (Response)

```typescript
export class PlayerComparisonDto {
  hero: {
    puuid: string;
    gameName: string;
    stats: PlayerStatsDto;
    laningPhase: LaningMetricsDto;
  };

  villain: {
    puuid: string;
    gameName: string;
    stats: PlayerStatsDto;
    laningPhase: LaningMetricsDto;
  };

  timelineComparison: {
    csGraph: {
      hero: Array<{ minute: number; value: number }>;
      villain: Array<{ minute: number; value: number }>;
    };
    goldGraph: {
      hero: Array<{ minute: number; value: number }>;
      villain: Array<{ minute: number; value: number }>;
    };
  };

  insights: {
    winner: 'hero' | 'villain';
    advantages: string[];
    recommendations: string[];
  };
}
```

---

## Controller

```typescript
@Get('analytics/compare')
@ApiOperation({ summary: 'Compare two players performance' })
@ApiResponse({ status: 200, type: PlayerComparisonDto })
async comparePlayerPerformance(
  @Query() query: ComparisonQueryDto
): Promise<PlayerComparisonDto> {
  return this.apiService.comparePlayerPerformance(
    query.heroPuuid,
    query.villainPuuid,
    {
      role: query.role,
      championId: query.championId,
      patch: query.patch
    }
  );
}
```

---

## Testes

```bash
# 1. Comparação básica (lifetime, all roles)
curl "http://localhost:3000/api/v1/analytics/compare?heroPuuid=abc123&villainPuuid=xyz789"

# 2. Comparação por role
curl "http://localhost:3000/api/v1/analytics/compare?heroPuuid=abc123&villainPuuid=xyz789&role=MID"

# 3. Comparação por campeão
curl "http://localhost:3000/api/v1/analytics/compare?heroPuuid=abc123&villainPuuid=xyz789&championId=157"

# 4. Comparação com todos filtros
curl "http://localhost:3000/api/v1/analytics/compare?heroPuuid=abc123&villainPuuid=xyz789&role=MID&championId=157&patch=15.19"
```

### Verificação SQL

```sql
-- Ver partidas disponíveis para comparação
SELECT COUNT(*) as hero_matches
FROM match_participants
WHERE puuid = 'abc123'
  AND role = 'MID';

SELECT COUNT(*) as villain_matches
FROM match_participants
WHERE puuid = 'xyz789'
  AND role = 'MID';

-- Verificar médias de CS @15min
SELECT
  AVG((csGraph[16])::int) as avg_cs_15min
FROM match_participants
WHERE puuid = 'abc123'
  AND role = 'MID';
```

---

## Frontend Integration

### Gráfico de Linha (Chart.js)

```typescript
const chartConfig = {
  type: 'line',
  data: {
    labels: csGraph.hero.map(d => d.minute),
    datasets: [
      {
        label: 'You',
        data: csGraph.hero.map(d => d.value),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
      },
      {
        label: 'Faker',
        data: csGraph.villain.map(d => d.value),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
      }
    ]
  },
  options: {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: 'CS per Minute Comparison'
      }
    }
  }
};
```

---

## Observações

1. **Apenas jogadores no banco:** Comparação só funciona para jogadores cujas partidas foram processadas
2. **Sample size:** Insights são mais precisos com 20+ jogos
3. **Role filtering:** Essencial para comparações justas (não comparar top laner com mid laner)
4. **Champion filtering:** Permite comparar performance no mesmo campeão
5. **Timeline médias:** Valores são arredondados para facilitar visualização
6. **Cache crucial:** Endpoint é caro computacionalmente, cache fortemente recomendado
7. **Insights dinâmicos:** Algoritmo de insights pode ser expandido com ML para detectar padrões
