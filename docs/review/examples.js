window.REVIEW_EXAMPLES = {
  "notice": "Proposta de consumo MET-34; não é resposta de endpoint existente. Dados reais da fixture, timestamp de processamento ilustrativo. Nenhum feedback de jogadores foi coletado.",
  "reports": [
    {
      "exampleKind": "design-contract-with-real-fixture-values",
      "schemaVersion": "proposal-1",
      "matchId": "BR1_3200579475",
      "participant": {
        "puuid": "tjsWO0e9LBfvNR_NPBhiv7tmX_lpw2h3BHnhY3288dfDhFHNzhwwzMzc0JG_r_UyR0BYjuu1MXqmaQ",
        "riotId": "naul#001",
        "champion": "Fiora",
        "role": "TOP"
      },
      "context": {
        "queueId": 420,
        "mapId": 11,
        "gameVersion": "16.2.741.3171",
        "gameDurationSeconds": 2368,
        "win": true,
        "historicalReference": null,
        "historicalReferenceReason": "insufficient_sample"
      },
      "dimensions": [
        {
          "id": "resources",
          "label": "Recursos",
          "metrics": [
            {
              "label": "Ouro do time",
              "metricId": "E04",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "tjsWO0e9LBfvNR_NPBhiv7tmX_lpw2h3BHnhY3288dfDhFHNzhwwzMzc0JG_r_UyR0BYjuu1MXqmaQ"
              },
              "unit": "percent",
              "window": null,
              "denominator": {
                "value": 88606,
                "unit": "gold",
                "population": "five participants on subject team"
              },
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[0].goldEarned",
                  "value": 24864
                },
                {
                  "source": "match",
                  "field": "info.participants[0].goldEarned",
                  "value": 24864
                },
                {
                  "source": "match",
                  "field": "info.participants[1].goldEarned",
                  "value": 17162
                },
                {
                  "source": "match",
                  "field": "info.participants[2].goldEarned",
                  "value": 18929
                },
                {
                  "source": "match",
                  "field": "info.participants[3].goldEarned",
                  "value": 17153
                },
                {
                  "source": "match",
                  "field": "info.participants[4].goldEarned",
                  "value": 10498
                }
              ],
              "value": 28.06130510349186,
              "origin": "derived",
              "reason": null,
              "method": "goldEarned / team sum(goldEarned) * 100"
            }
          ]
        },
        {
          "id": "combat",
          "label": "Combate",
          "metrics": [
            {
              "label": "Dano a campeões do time",
              "metricId": "C02",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "tjsWO0e9LBfvNR_NPBhiv7tmX_lpw2h3BHnhY3288dfDhFHNzhwwzMzc0JG_r_UyR0BYjuu1MXqmaQ"
              },
              "unit": "percent",
              "window": null,
              "denominator": {
                "value": 232227,
                "unit": "damage",
                "population": "five participants on subject team"
              },
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[0].totalDamageDealtToChampions",
                  "value": 81226
                },
                {
                  "source": "match",
                  "field": "info.participants[0].totalDamageDealtToChampions",
                  "value": 81226
                },
                {
                  "source": "match",
                  "field": "info.participants[1].totalDamageDealtToChampions",
                  "value": 50016
                },
                {
                  "source": "match",
                  "field": "info.participants[2].totalDamageDealtToChampions",
                  "value": 40814
                },
                {
                  "source": "match",
                  "field": "info.participants[3].totalDamageDealtToChampions",
                  "value": 54341
                },
                {
                  "source": "match",
                  "field": "info.participants[4].totalDamageDealtToChampions",
                  "value": 5830
                }
              ],
              "value": 34.97698372712906,
              "origin": "derived",
              "reason": null,
              "method": "totalDamageDealtToChampions / team sum(totalDamageDealtToChampions) * 100"
            },
            {
              "label": "Cura em aliados",
              "metricId": "C04.heal",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "tjsWO0e9LBfvNR_NPBhiv7tmX_lpw2h3BHnhY3288dfDhFHNzhwwzMzc0JG_r_UyR0BYjuu1MXqmaQ"
              },
              "unit": "count",
              "window": null,
              "denominator": null,
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[0].totalHealsOnTeammates",
                  "value": 2877
                }
              ],
              "value": 2877,
              "origin": "observed",
              "reason": null,
              "method": "totalHealsOnTeammates"
            },
            {
              "label": "Escudos em aliados",
              "metricId": "C04.shield",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "tjsWO0e9LBfvNR_NPBhiv7tmX_lpw2h3BHnhY3288dfDhFHNzhwwzMzc0JG_r_UyR0BYjuu1MXqmaQ"
              },
              "unit": "count",
              "window": null,
              "denominator": null,
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[0].totalDamageShieldedOnTeammates",
                  "value": 0
                }
              ],
              "value": 0,
              "origin": "observed",
              "reason": null,
              "method": "totalDamageShieldedOnTeammates"
            }
          ]
        },
        {
          "id": "vision",
          "label": "Visão",
          "metrics": [
            {
              "label": "Wards colocadas",
              "metricId": "V03.placed",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "tjsWO0e9LBfvNR_NPBhiv7tmX_lpw2h3BHnhY3288dfDhFHNzhwwzMzc0JG_r_UyR0BYjuu1MXqmaQ"
              },
              "unit": "count",
              "window": null,
              "denominator": null,
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[0].wardsPlaced",
                  "value": 13
                }
              ],
              "value": 13,
              "origin": "observed",
              "reason": null,
              "method": "wardsPlaced"
            },
            {
              "label": "Wards removidas",
              "metricId": "V03.removed",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "tjsWO0e9LBfvNR_NPBhiv7tmX_lpw2h3BHnhY3288dfDhFHNzhwwzMzc0JG_r_UyR0BYjuu1MXqmaQ"
              },
              "unit": "count",
              "window": null,
              "denominator": null,
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[0].wardsKilled",
                  "value": 4
                }
              ],
              "value": 4,
              "origin": "observed",
              "reason": null,
              "method": "wardsKilled"
            }
          ]
        },
        {
          "id": "structures",
          "label": "Estruturas",
          "metrics": [
            {
              "label": "Dano a torres do time",
              "metricId": "O03",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "tjsWO0e9LBfvNR_NPBhiv7tmX_lpw2h3BHnhY3288dfDhFHNzhwwzMzc0JG_r_UyR0BYjuu1MXqmaQ"
              },
              "unit": "percent",
              "window": null,
              "denominator": {
                "value": 36129,
                "unit": "damage",
                "population": "five participants on subject team"
              },
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[0].damageDealtToTurrets",
                  "value": 28592
                },
                {
                  "source": "match",
                  "field": "info.participants[0].damageDealtToTurrets",
                  "value": 28592
                },
                {
                  "source": "match",
                  "field": "info.participants[1].damageDealtToTurrets",
                  "value": 951
                },
                {
                  "source": "match",
                  "field": "info.participants[2].damageDealtToTurrets",
                  "value": 3235
                },
                {
                  "source": "match",
                  "field": "info.participants[3].damageDealtToTurrets",
                  "value": 3351
                },
                {
                  "source": "match",
                  "field": "info.participants[4].damageDealtToTurrets",
                  "value": 0
                }
              ],
              "value": 79.1386420880733,
              "origin": "derived",
              "reason": null,
              "method": "damageDealtToTurrets / team sum(damageDealtToTurrets) * 100"
            }
          ]
        }
      ],
      "episodes": [
        {
          "id": "BR1_3200579475:death:20:46",
          "label": "Morte e objetivos adversários nos 60 s seguintes",
          "origin": "derived",
          "unit": "death",
          "value": 1,
          "eligibleDeathsInThisExample": 1,
          "window": {
            "startMs": 1198068,
            "endMs": 1258068,
            "bounds": "(]"
          },
          "censored": false,
          "evidenceIds": [
            "BR1_3200579475:20:46",
            "BR1_3200579475:21:33",
            "BR1_3200579475:21:41"
          ],
          "limitation": "Proximidade temporal; não demonstra que a morte causou os objetivos. Este exemplo contém um episódio, não a contagem de todas as mortes."
        }
      ],
      "evidence": [
        {
          "id": "BR1_3200579475:20:46",
          "timestampMs": 1198068,
          "type": "CHAMPION_KILL",
          "frameIndex": 20,
          "eventIndex": 46,
          "fields": {
            "victimId": 1,
            "killerId": 6
          }
        },
        {
          "id": "BR1_3200579475:21:33",
          "timestampMs": 1240704,
          "type": "BUILDING_KILL",
          "frameIndex": 21,
          "eventIndex": 33,
          "fields": {
            "killerId": 8,
            "teamId": 100,
            "buildingType": "TOWER_BUILDING"
          }
        },
        {
          "id": "BR1_3200579475:21:41",
          "timestampMs": 1244550,
          "type": "ELITE_MONSTER_KILL",
          "frameIndex": 21,
          "eventIndex": 41,
          "fields": {
            "killerId": 7,
            "killerTeamId": 200,
            "monsterType": "BARON_NASHOR"
          }
        }
      ]
    },
    {
      "exampleKind": "design-contract-with-real-fixture-values",
      "schemaVersion": "proposal-1",
      "matchId": "BR1_3200579475",
      "participant": {
        "puuid": "gcd7avXhWxpSJqhotQaFmRujFjyKZd6kDbRkPHQzGoUEsI5utM5QEMcLXNFgrMSKcF3InCsAf7ITnA",
        "riotId": "PIXELATED KISSES#V1NI",
        "champion": "Milio",
        "role": "UTILITY"
      },
      "context": {
        "queueId": 420,
        "mapId": 11,
        "gameVersion": "16.2.741.3171",
        "gameDurationSeconds": 2368,
        "win": true,
        "historicalReference": null,
        "historicalReferenceReason": "insufficient_sample"
      },
      "dimensions": [
        {
          "id": "resources",
          "label": "Recursos",
          "metrics": [
            {
              "label": "Ouro do time",
              "metricId": "E04",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "gcd7avXhWxpSJqhotQaFmRujFjyKZd6kDbRkPHQzGoUEsI5utM5QEMcLXNFgrMSKcF3InCsAf7ITnA"
              },
              "unit": "percent",
              "window": null,
              "denominator": {
                "value": 88606,
                "unit": "gold",
                "population": "five participants on subject team"
              },
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[4].goldEarned",
                  "value": 10498
                },
                {
                  "source": "match",
                  "field": "info.participants[0].goldEarned",
                  "value": 24864
                },
                {
                  "source": "match",
                  "field": "info.participants[1].goldEarned",
                  "value": 17162
                },
                {
                  "source": "match",
                  "field": "info.participants[2].goldEarned",
                  "value": 18929
                },
                {
                  "source": "match",
                  "field": "info.participants[3].goldEarned",
                  "value": 17153
                },
                {
                  "source": "match",
                  "field": "info.participants[4].goldEarned",
                  "value": 10498
                }
              ],
              "value": 11.847956120353023,
              "origin": "derived",
              "reason": null,
              "method": "goldEarned / team sum(goldEarned) * 100"
            }
          ]
        },
        {
          "id": "combat",
          "label": "Combate",
          "metrics": [
            {
              "label": "Dano a campeões do time",
              "metricId": "C02",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "gcd7avXhWxpSJqhotQaFmRujFjyKZd6kDbRkPHQzGoUEsI5utM5QEMcLXNFgrMSKcF3InCsAf7ITnA"
              },
              "unit": "percent",
              "window": null,
              "denominator": {
                "value": 232227,
                "unit": "damage",
                "population": "five participants on subject team"
              },
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[4].totalDamageDealtToChampions",
                  "value": 5830
                },
                {
                  "source": "match",
                  "field": "info.participants[0].totalDamageDealtToChampions",
                  "value": 81226
                },
                {
                  "source": "match",
                  "field": "info.participants[1].totalDamageDealtToChampions",
                  "value": 50016
                },
                {
                  "source": "match",
                  "field": "info.participants[2].totalDamageDealtToChampions",
                  "value": 40814
                },
                {
                  "source": "match",
                  "field": "info.participants[3].totalDamageDealtToChampions",
                  "value": 54341
                },
                {
                  "source": "match",
                  "field": "info.participants[4].totalDamageDealtToChampions",
                  "value": 5830
                }
              ],
              "value": 2.510474664875316,
              "origin": "derived",
              "reason": null,
              "method": "totalDamageDealtToChampions / team sum(totalDamageDealtToChampions) * 100"
            },
            {
              "label": "Cura em aliados",
              "metricId": "C04.heal",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "gcd7avXhWxpSJqhotQaFmRujFjyKZd6kDbRkPHQzGoUEsI5utM5QEMcLXNFgrMSKcF3InCsAf7ITnA"
              },
              "unit": "count",
              "window": null,
              "denominator": null,
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[4].totalHealsOnTeammates",
                  "value": 13741
                }
              ],
              "value": 13741,
              "origin": "observed",
              "reason": null,
              "method": "totalHealsOnTeammates"
            },
            {
              "label": "Escudos em aliados",
              "metricId": "C04.shield",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "gcd7avXhWxpSJqhotQaFmRujFjyKZd6kDbRkPHQzGoUEsI5utM5QEMcLXNFgrMSKcF3InCsAf7ITnA"
              },
              "unit": "count",
              "window": null,
              "denominator": null,
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[4].totalDamageShieldedOnTeammates",
                  "value": 19049
                }
              ],
              "value": 19049,
              "origin": "observed",
              "reason": null,
              "method": "totalDamageShieldedOnTeammates"
            }
          ]
        },
        {
          "id": "vision",
          "label": "Visão",
          "metrics": [
            {
              "label": "Wards colocadas",
              "metricId": "V03.placed",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "gcd7avXhWxpSJqhotQaFmRujFjyKZd6kDbRkPHQzGoUEsI5utM5QEMcLXNFgrMSKcF3InCsAf7ITnA"
              },
              "unit": "count",
              "window": null,
              "denominator": null,
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[4].wardsPlaced",
                  "value": 46
                }
              ],
              "value": 46,
              "origin": "observed",
              "reason": null,
              "method": "wardsPlaced"
            },
            {
              "label": "Wards removidas",
              "metricId": "V03.removed",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "gcd7avXhWxpSJqhotQaFmRujFjyKZd6kDbRkPHQzGoUEsI5utM5QEMcLXNFgrMSKcF3InCsAf7ITnA"
              },
              "unit": "count",
              "window": null,
              "denominator": null,
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[4].wardsKilled",
                  "value": 6
                }
              ],
              "value": 6,
              "origin": "observed",
              "reason": null,
              "method": "wardsKilled"
            }
          ]
        },
        {
          "id": "structures",
          "label": "Estruturas",
          "metrics": [
            {
              "label": "Dano a torres do time",
              "metricId": "O03",
              "metricVersion": 1,
              "processingVersion": 1,
              "processedAt": "2026-09-23T00:00:00.000Z",
              "matchId": "BR1_3200579475",
              "subject": {
                "kind": "participant",
                "id": "gcd7avXhWxpSJqhotQaFmRujFjyKZd6kDbRkPHQzGoUEsI5utM5QEMcLXNFgrMSKcF3InCsAf7ITnA"
              },
              "unit": "percent",
              "window": null,
              "denominator": {
                "value": 36129,
                "unit": "damage",
                "population": "five participants on subject team"
              },
              "quality": {
                "validSamples": 1,
                "totalSamples": 1,
                "coverage": 1,
                "unknownEvents": 0,
                "reconciliationIssues": []
              },
              "evidence": [
                {
                  "source": "match",
                  "field": "info.participants[4].damageDealtToTurrets",
                  "value": 0
                },
                {
                  "source": "match",
                  "field": "info.participants[0].damageDealtToTurrets",
                  "value": 28592
                },
                {
                  "source": "match",
                  "field": "info.participants[1].damageDealtToTurrets",
                  "value": 951
                },
                {
                  "source": "match",
                  "field": "info.participants[2].damageDealtToTurrets",
                  "value": 3235
                },
                {
                  "source": "match",
                  "field": "info.participants[3].damageDealtToTurrets",
                  "value": 3351
                },
                {
                  "source": "match",
                  "field": "info.participants[4].damageDealtToTurrets",
                  "value": 0
                }
              ],
              "value": 0.0,
              "origin": "derived",
              "reason": null,
              "method": "damageDealtToTurrets / team sum(damageDealtToTurrets) * 100"
            }
          ]
        }
      ],
      "episodes": [
        {
          "id": "BR1_3200579475:death:20:49",
          "label": "Morte e objetivos adversários nos 60 s seguintes",
          "origin": "derived",
          "unit": "death",
          "value": 1,
          "eligibleDeathsInThisExample": 1,
          "window": {
            "startMs": 1199103,
            "endMs": 1259103,
            "bounds": "(]"
          },
          "censored": false,
          "evidenceIds": [
            "BR1_3200579475:20:49",
            "BR1_3200579475:21:33",
            "BR1_3200579475:21:41"
          ],
          "limitation": "Proximidade temporal; não demonstra que a morte causou os objetivos. Este exemplo contém um episódio, não a contagem de todas as mortes."
        }
      ],
      "evidence": [
        {
          "id": "BR1_3200579475:20:49",
          "timestampMs": 1199103,
          "type": "CHAMPION_KILL",
          "frameIndex": 20,
          "eventIndex": 49,
          "fields": {
            "victimId": 5,
            "killerId": 9
          }
        },
        {
          "id": "BR1_3200579475:21:33",
          "timestampMs": 1240704,
          "type": "BUILDING_KILL",
          "frameIndex": 21,
          "eventIndex": 33,
          "fields": {
            "killerId": 8,
            "teamId": 100,
            "buildingType": "TOWER_BUILDING"
          }
        },
        {
          "id": "BR1_3200579475:21:41",
          "timestampMs": 1244550,
          "type": "ELITE_MONSTER_KILL",
          "frameIndex": 21,
          "eventIndex": 41,
          "fields": {
            "killerId": 7,
            "killerTeamId": 200,
            "monsterType": "BARON_NASHOR"
          }
        }
      ]
    }
  ]
};
