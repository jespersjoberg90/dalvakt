# DALVAKT

Regnspaning för fjällfiske i Västerbottens fjäll. Visar nederbördsprognos per
dalgång på en levande, animerad karta (Idag → +3 dygn) för att hitta den
torraste (mest fiskbara) dalgången just nu.

Statisk webbapp — HTML/CSS/vanilla JS, inga byggverktyg, inga dependencies.

## Köra lokalt

Servera mappen statiskt, t.ex.:

```
python3 -m http.server 8080
```

och öppna `http://localhost:8080`.

(Att öppna `index.html` direkt som `file://` fungerar inte — `fetch()`-anrop
till SMHI blockeras av webbläsaren för `file://`-origin.)

## Data

Väderdata hämtas direkt från webbläsaren mot SMHI:s öppna API, **SNOW1gv1**
(inget API-nycklar, ingen backend/proxy behövs — CORS är verifierat att
fungera):

```
https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/{lon}/lat/{lat}/data.json
```

Torrt/fiskbart definieras som `< 1.0 mm` nederbörd för dygnet
(`DRY_THRESHOLD_MM` i [js/app.js](js/app.js)).

## Struktur

```
index.html      markup
css/style.css   all styling
js/app.js       datahämtning + rendering
```

## Deploy

Statisk sajt, kan deployas direkt till Vercel eller Netlify utan
byggkonfiguration — peka bara på repo-roten.

## Kända begränsningar

- Sub-byarna som syns vid inzoomning på kartan har ingen egen väderdata (rent
  visuella platshållare).
- Ingen offline-hantering/caching om SMHI:s API är nere.
- Kartan är en medvetet stiliserad illustration, inte en geografisk projektion.
- Ingen persistent lagring — allt är in-memory, laddas om vid varje sidladdning.
