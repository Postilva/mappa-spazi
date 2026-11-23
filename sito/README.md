# Sito di prova – Spazi pubblici di Taranto

Stato al 10/11/2026: **versione di prova**, tutti i dati «da verificare» (nessun sopralluogo). Stile A «Istituzionale chiaro» (hub: `progetti/mappa-spazi/stile.md`): solo i colori e i font approvati o proposti lì.

Cosa mostra: i **locali non residenziali** del Comune di Taranto (elenco beni immobili 2024) in tutta la città. Le abitazioni non sono pubblicate. La regola di selezione è in `scripts/tipi.py`.

## Come si rigenera

```
pip install --user -r scripts/requirements.txt
python3 scripts/posizioni_citta.py        # posizioni dal catasto (lento, ~1,5 ore la prima volta; poi usa la cache)
python3 scripts/scarica_base_osm.py       # base OpenStreetMap attorno agli spazi
python3 scripts/genera_schede_citta.py    # schede JSON, con via più vicina e zona
python3 scripts/build_sito.py             # pagine
```

Dopo una modifica a mano alle schede `dati/edifici/*.json` basta l'ultimo comando.

## Struttura

| Percorso | Contenuto |
|---|---|
| `src/corpo.html` | Struttura delle pagine e testi (apertura, Metodo e fonti). I numeri nei testi sono segnaposto `data-num`, riempiti dai dati |
| `src/app.css` | Stile; colori come variabili su `:root`, tema unico chiaro |
| `src/app.js` | JS vanilla: navigazione con hash, mappa MapLibre, filtri, elenco, scheda, scheda di esempio con modello 3D |
| `src/vendor/maplibre-gl-4.7.1.css` | CSS di MapLibre (BSD-3), incorporato nella pagina unica |
| `dati/edifici.geojson` | Punti degli spazi in mappa con i campi della scheda: solo i locali di interesse (`locali`), più il numero di abitazioni e pertinenze nella stessa particella |
| `dati/base.geojson` | Poligoni catastali delle particelle in mappa |
| `dati/osm/` | Base OpenStreetMap: tessere vettoriali OpenFreeMap (schema OpenMapTiles), zoom 10–13 su tutta l'area e zoom 14 solo attorno agli spazi; caratteri Noto Sans per le etichette; `fonte.json` con versione e attribuzione. © OpenStreetMap contributors, ODbL |
| `dist/pagina-claude.html` | **File unico** per la pagina claude.ai: frammento senza doctype/html/head/body, CSS, JS, dati e tessere incorporati |
| `index.html`, `assets/` | Versione normale per un futuro hosting: dati letti con `fetch` da `dati/` (serve un server http) |

Pagine (hash): `#mappa` (home), `#elenco`, `#esempio`, `#metodo`, `#edificio-<foglio>-<particella>`.

## Scelte tecniche

- **Mappa di base incorporata.** La pagina claude.ai non può caricare tessere da server esterni (CSP): tessere e caratteri sono nella pagina, compressi (gzip + base64), e MapLibre li legge con il protocollo `incorporato://` (`maplibregl.addProtocol`, decompressione con `DecompressionStream`). Dove la tessera di zoom 14 non c'è, il protocollo risponde 404 e MapLibre ingrandisce quella di zoom 13.
- **Punti raggruppati.** Gli spazi sono un livello della mappa con raggruppamento (cerchio blu con il numero); i simboli degli stati sono disegnati su canvas con le stesse forme della legenda. Non sono pulsanti HTML: l'alternativa da tastiera e per lettori di schermo è la pagina Elenco.
- **Scheda di esempio** (`#esempio`): edificio inventato, dichiarato tale in testa alla pagina. Usa lo stesso codice delle schede vere. Le «foto» sono disegni SVG; il modello 3D è fatto di volumi schematici con three.js r128, caricato da cdnjs solo quando si apre l'esempio.
- **Solo censimento** (Antonio, 23/11/2026): tolti la pagina «Cerco uno spazio», il modulo e i pulsanti «Mi interessa». Il sito mostra cosa c'è e in che stato è; l'incontro tra spazi e attività resta una proposta per il T4 (hub, `2026-11-10_visione-piattaforma.md`).
- Niente `alert`/`window.open`; larghezza minima 390 px senza scroll orizzontale; aree cliccabili ≥ 44 px; focus visibile; `prefers-reduced-motion` (il modello 3D non gira da solo).

## Verifica (10/11/2026)

Playwright (Chromium) con la pagina unica avvolta in uno scheletro minimo e una CSP che consente solo cdnjs e Google Fonts, a 390×844 e 1280×900: nessun errore in console, nessuno scroll orizzontale; provati mappa, scheda, «Vedi sulla mappa», scheda di esempio con cambio del modello 3D, invio del modulo in bozza.

## Limiti noti

- Via e zona sono ricavate in automatico da OpenStreetMap e non sono verificate: non sono l'indirizzo.
- Lontano dagli spazi la mappa ha meno dettaglio (zoom 13 ingrandito).
- La pagina unica pesa alcuni MB per via delle tessere incorporate.
- Serve un browser recente (WebGL, `DecompressionStream`): altrimenti compare un messaggio che rimanda all'Elenco.
