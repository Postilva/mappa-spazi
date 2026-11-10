# Sito di prova – Spazi pubblici dei Tamburi

Stato al 10/11/2026: **versione di prova**, tutti i dati «da verificare» (nessun sopralluogo). Stile A «Istituzionale chiaro» (hub: `progetti/mappa-spazi/stile.md`): solo i colori e i font approvati lì.

## Come si rigenera

```
pip install --user -r scripts/requirements.txt     # shapely, pyproj, pyshp (non versionati)
python3 scripts/scarica_base_osm.py                 # solo per aggiornare la base OpenStreetMap
python3 scripts/build_sito.py [--istat <cartella SHP di R16_21 estratta>]
```

- Le particelle catastali della mappa di base vengono dalla cache WFS `.cache/catasto/` (passo 4, non versionata). Se manca, lo script riprende i livelli dal `sito/dati/base.geojson` già generato.
- `--istat` serve solo per ricalcolare la terraferma (sezioni ISTAT 2021); senza, la terraferma viene ripresa da `base.geojson`.
- Dopo ogni modifica alle schede `dati/edifici/*.json` basta rilanciare lo script.

## Struttura

| Percorso | Contenuto |
|---|---|
| `src/corpo.html` | Struttura delle pagine (intestazione, viste, piè di pagina) e testo della pagina Metodo e fonti |
| `src/app.css` | Stile; colori come variabili su `:root`, tema unico chiaro |
| `src/app.js` | JS vanilla: navigazione con hash, mappa MapLibre, filtri, elenco, scheda edificio |
| `src/vendor/maplibre-gl-4.7.1.css` | CSS di MapLibre (BSD-3), incorporato nella pagina unica |
| `dati/edifici.geojson` | Punti dei 29 edifici con tutti i campi della scheda + `tipo_bene`, `n_unita`, `area_particella_m2` |
| `dati/osm/` | Base OpenStreetMap (11/11/2026): 50 tessere vettoriali OpenFreeMap, schema OpenMapTiles, zoom 10–14, più i caratteri Noto Sans per le etichette (`fonte.json`: versione e attribuzione). © OpenStreetMap contributors, ODbL |
| `dati/base.geojson` | Mappa di base: `terra` (ISTAT), `particelle` (isolati catastali uniti e semplificati), `edificio` (poligoni delle 29 particelle), `fuori` (maschera), `confine` |
| `dist/pagina-claude.html` | **File unico** per la pagina privata claude.ai: frammento senza doctype/html/head/body, CSS, JS e dati incorporati (~370 KB) |
| `index.html`, `assets/` | Versione normale per un futuro hosting: documento completo, dati letti con `fetch` da `dati/` (serve un server http, non funziona da `file://`) |

Pagine (hash): `#mappa` (home), `#elenco`, `#metodo`, `#edificio-<foglio>-<particella>` (es. `#edificio-201-208`).

## Vincoli della pagina claude.ai

- Script esterni solo da cdnjs (MapLibre GL JS **4.7.1**, versione esatta), fogli di stile esterni solo da Google Fonts (Anton, Inter 400–700, con font di riserva). La pagina non può caricare tessere da server esterni (CSP): la base OpenStreetMap (tessere e caratteri) è incorporata in base64 e servita a MapLibre con il protocollo `incorporato://` (`maplibregl.addProtocol`). Niente sprite: nessuna icona sulla mappa, solo etichette (vie, quartieri, acque). Nella pagina unica i livelli `terra` e `particelle` di `base.geojson` non sono più inclusi.
- Simboli degli stati come marker HTML/SVG (cerchio, quadrato, triangolo, rombo, cerchio tratteggiato; bordo bianco 2 px; anello rosso sulla selezione), area cliccabile 44×44 px.
- Niente `alert`/`window.open`; «Proponi un'idea» e «Segnala un errore» mostrano un testo: i moduli non sono ancora attivi.
- Larghezza minima 390–400 px senza scroll orizzontale; gutter `max(16px, env(safe-area-inset-*))`; focus visibile; `prefers-reduced-motion`.

## Verifica (passo 8, 10/11/2026)

Playwright (Chromium) con la pagina unica avvolta in uno scheletro minimo e una CSP che consente solo cdnjs e Google Fonts, a 390×844 e 1280×800: nessun errore in console né richieste fallite, nessuno scroll orizzontale, 29 marcatori visibili, navigazione con hash (anche link diretto a una scheda e scheda inesistente), aree cliccabili ≥ 44 px.

## Limiti noti

- A zoom iniziale alcuni simboli vicini si sovrappongono (si separano ingrandendo; l'Elenco è l'alternativa).
- La base OSM copre solo i Tamburi e dintorni (fino a ~2 km oltre la vista) e arriva a zoom 14: oltre, le tessere vengono ingrandite. Va riscaricata ogni tanto (`scripts/scarica_base_osm.py`).
- La pagina unica pesa ~3 MB (prima ~370 KB) per via delle tessere incorporate.
- MapLibre usa un worker `blob:`: se la piattaforma lo blocca, la pagina mostra il messaggio di riserva e rimanda all'Elenco.
