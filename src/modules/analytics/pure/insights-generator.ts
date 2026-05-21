import {
  ComparePlayerStatsDto,
  LaningPhaseDto,
  CompareInsightsDto,
} from '../dto/compare-evolve.dto';

export function generateInsights(
  heroStats: ComparePlayerStatsDto,
  villainStats: ComparePlayerStatsDto,
  heroLaning: LaningPhaseDto,
  villainLaning: LaningPhaseDto,
): CompareInsightsDto {
  const advantages: string[] = [];
  const recommendations: string[] = [];

  if (heroStats.avgCspm > 0 && villainStats.avgCspm > 0) {
    const csDiff =
      ((heroStats.avgCspm - villainStats.avgCspm) / villainStats.avgCspm) * 100;
    if (csDiff > 10) {
      advantages.push(
        `Herói tem ${parseFloat(csDiff.toFixed(1))}% mais CS/min`,
      );
    } else if (csDiff < -10) {
      advantages.push(
        `Vilão tem ${parseFloat((-csDiff).toFixed(1))}% mais CS/min`,
      );
      recommendations.push('Herói deve melhorar farm e controle de wave');
    }
  }

  const csd15Diff = heroLaning.avgCsd15 - villainLaning.avgCsd15;
  if (Math.abs(csd15Diff) > 3) {
    if (csd15Diff > 0) {
      advantages.push(`Herói tem +${parseFloat(csd15Diff.toFixed(1))} CSD@15`);
    } else {
      advantages.push(
        `Vilão tem +${parseFloat((-csd15Diff).toFixed(1))} CSD@15`,
      );
      recommendations.push(
        'Herói deve focar em domínio de lane nos primeiros 15 min',
      );
    }
  }

  const visionDiff = heroStats.avgVisionScore - villainStats.avgVisionScore;
  if (Math.abs(visionDiff) > 5) {
    if (visionDiff > 0) {
      advantages.push(
        `Herói tem +${parseFloat(visionDiff.toFixed(1))} vision score`,
      );
    } else {
      advantages.push(
        `Vilão tem +${parseFloat((-visionDiff).toFixed(1))} vision score`,
      );
      recommendations.push(
        'Herói deve comprar mais wards e melhorar vision control',
      );
    }
  }

  if (heroStats.avgDpm > 0 && villainStats.avgDpm > 0) {
    const dpmDiff =
      ((heroStats.avgDpm - villainStats.avgDpm) / villainStats.avgDpm) * 100;
    if (dpmDiff > 10) {
      advantages.push(`Herói tem ${parseFloat(dpmDiff.toFixed(1))}% mais DPM`);
    } else if (dpmDiff < -10) {
      advantages.push(
        `Vilão tem ${parseFloat((-dpmDiff).toFixed(1))}% mais DPM`,
      );
      recommendations.push(
        'Herói deve participar mais de teamfights e buscar trades',
      );
    }
  }

  if (
    heroStats.avgKda > villainStats.avgKda &&
    heroStats.winRate < villainStats.winRate
  ) {
    recommendations.push(
      'Herói tem KDA superior mas winrate inferior — deve converter vantagens em objetivos',
    );
  } else if (
    villainStats.avgKda > heroStats.avgKda &&
    villainStats.winRate < heroStats.winRate
  ) {
    advantages.push(
      'Herói converte melhor suas vantagens em vitórias apesar de KDA inferior',
    );
  }

  const winner: 'hero' | 'villain' =
    heroStats.winRate >= villainStats.winRate ? 'hero' : 'villain';

  return { winner, advantages, recommendations };
}
