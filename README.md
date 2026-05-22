# vinlistor

Databas över vinlistor på restauranger i Stockholms innerstad: **vin + pris + restaurang**.
Konsumentverktyg, syskon till [vinappen](../vinappen). Pilot på 5–10 restauranger först,
sen skala.

## Hur det funkar

```
restaurants.json  →  hämta meny (HTML/PDF)  →  Claude → JSON  →  Supabase
```

Istället för en egen parser per restaurang läser **Claude** menyn (text eller PDF) och
returnerar strukturerade rader. Inga uppfunna priser — bara det som står på menyn.

## Kom igång

1. `npm install`
2. Kopiera `.env.example` → `.env` och fyll i `ANTHROPIC_API_KEY` + Supabase-nycklar.
3. Kör `schema.sql` i Supabase SQL-editorn (project ref `ybyynrlfqbbjkybgldrm`).
4. Lägg restauranger i `restaurants.json` (namn, stadsdel, `wine_list_url`).
5. Testkör utan att skriva till DB:
   ```
   npm run collect -- --dry --only "restaurangnamn"
   ```
6. Skarpt (skriver till Supabase):
   ```
   npm run collect                      # alla
   npm run collect -- --only "namn"     # en restaurang
   ```

`wine_list_url` får peka på en HTML-sida eller en PDF. JS-tunga sidor renderas
automatiskt med Playwright (kräver `npm i playwright && npx playwright install chromium`).

## Schema

- `restaurants` — namn (unikt), stadsdel, adress, webbplats, vinlist_url
- `wines` — restaurant_id, namn, producent, årgång, typ, land, region, druva,
  pris_glas, pris_flaska, valuta, källa_url, insamlad_datum

En körning **ersätter** en restaurangs viner (delete + insert) så priserna hålls aktuella.

## Status

Pilot. Att göra: fyll `restaurants.json` med riktiga restauranger, kör in datan,
verifiera priser, lägg sen till vinmatchning mellan restauranger (för prisjämförelse).
