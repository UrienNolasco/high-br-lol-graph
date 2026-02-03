# Especificação de Integração: Riot Account & Match

## 1. Account V1 (Riot ID -> PUUID)
Este endpoint é a porta de entrada. É o único jeito de achar um jogador hoje em dia.

* **URL:** `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`
* **Método:** `GET`
* **Headers:** `X-Riot-Token: {API_KEY}`

### Payload de Sucesso (200 OK)
```json
{
    "puuid": "BhDoHmSkmO8jNRBryyfkx4IYOdY-8kda9smkLcVS0yPoS0B01MqkdtsR1r1f7Aqu-0pWwxT5w6nBzQ",
    "gameName": "UrienMano",
    "tagLine": "br1"
}

Payload de Erro (404 Not Found)
Deve ser tratado e lançado como NotFoundException no NestJS.

{
    "status": {
        "status_code": 404,
        "message": "Data not found - No results found for player with riot id UrienMano##BR1"
    }
}


2. Match V5 (Listagem)
Usado para descobrir quais partidas processar.

URL: https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids

Query Params: start=0, count=20 (Para MVP/On-Demand).

Retorno: ["BR1_287463...", "BR1_287464..."]


3. DTOs Sugeridos (TypeScript)

export class RiotAccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export class RiotErrorDto {
  status: {
    status_code: number;
    message: string;
  }
}