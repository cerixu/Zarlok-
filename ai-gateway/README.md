# Żarłok AI Gateway

Bezpieczna warstwa pośrednia dla prywatnej aplikacji Żarłok.

Repozytorium Kucharka jest publiczne, dlatego klucza OpenAI **nie wolno** wkładać do PWA, `localStorage`, JavaScriptu ani repozytorium.

## Konfiguracja

Utwórz Cloudflare Worker i użyj `worker.js`.

Sekrety Cloudflare:
- `OPENAI_API_KEY` = Twój własny klucz OpenAI
- `zarlok_GATEWAY_TOKEN` = długi losowy token dostępu

Zmienne:
- `ALLOWED_ORIGIN` = dokładny origin GitHub Pages, np. `https://cerixu.github.io`
- `OPENAI_MODEL` = opcjonalnie, domyślnie `gpt-6-luna`

Sekretów nie wpisuj do GitHuba.

Każdy użytkownik może mieć własny Worker i własny `OPENAI_API_KEY`. Wtedy inne osoby mające dostęp do kodu GitHub Pages nie dostają dostępu do Twojego klucza OpenAI.

## Endpointy

- `GET /health`
- `POST /v1/recipe-from-url` z `{"url":"https://..."}`
- `POST /v1/ask-recipe` z pytaniem i kontekstem receptury

Autoryzacja:
`Authorization: Bearer TWOJ_zarlok_GATEWAY_TOKEN`

Gateway jest stateless. Nie używa trwałej historii rozmów. Bieżący kontekst rozmowy jest przesyłany z aplikacji tylko w ramach konkretnego żądania.

## Ochrona importu URL

- tylko HTTPS
- blokada localhost i typowych prywatnych zakresów IP
- limity rozmiaru URL, strony i pytania
- ręczna obsługa przekierowań z ponowną walidacją URL
- brak danych logowania w URL
- brak logiki zapisu danych użytkownika
