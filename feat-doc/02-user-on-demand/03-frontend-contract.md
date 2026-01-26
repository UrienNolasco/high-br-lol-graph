# Contrato de Interface (API Response)

## Contexto

O Frontend precisa saber se deve mostrar uma barra de carregamento ou os dados.

## Fluxo Sugerido para o Front (Info para o Dev Backend montar o JSON)

1.  **Request:** `POST /update/12345`
2.  **Response A (Tem dados novos):**

    ```json
    {
      "status": "processing",
      "newMatchesCount": 5,
      "estimatedTime": 15 // segundos
    }
    ```

    _Ação do Front:_ Exibir spinner "Analisando 5 novas partidas..." e fazer polling no endpoint de perfil.

3.  **Response B (Tudo atualizado):**
    ```json
    {
      "status": "up_to_date",
      "newMatchesCount": 0
    }
    ```
    _Ação do Front:_ Exibir "Perfil atualizado" e mostrar lista de jogos.
