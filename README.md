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

## Dalgångar

| Dalgång | lat | lon | Källa/anmärkning |
|---|---|---|---|
| Ammarnäs | 65.966 | 16.200 | |
| Vindelfjällen (Ransaredet) | 65.883 | 16.383 | |
| Hemavan | 65.817 | 15.167 | |
| Tärnaby | 65.717 | 15.267 | |
| Björkvattnet | 65.610 | 15.212 | Fiskevårdsområde (öring/röding), Wikipedia (Stor-Björkvattnet) |
| Kittelfjäll | 65.251 | 15.506 | Wikipedia; känt harr/röding/öring-fiske (Saksensjön m.fl.) |
| Klimpfjäll | 65.050 | 14.983 | |
| Marsfjället | 65.033 | 15.033 | |
| Saxnäs | 64.972 | 15.346 | Wikipedia; by vid Kultsjön med eget Fiskecentrum |

Kartans x/y-koordinater är handplacerade efter rangordning (inte råa lat/lon)
så att varje dalgångs öst-väst/nord-syd-relation till alla andra stämmer,
utan att vara en geografisk projektion — se kommentaren i
[js/app.js](js/app.js).

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
