# Sito di prova – Vuoti a rendere

Stato al 10/11/2026: **versione di prova**, tutti i dati «da verificare» (nessun sopralluogo). Dal 23/11/2026 nello **stile del portale Postilva** (come il sito delle bonifiche): fondo scuro, Space Grotesk e IBM Plex Mono, colore Tufo `#e0b56a` e quadratini come segno (hub: `progetti/mappa-spazi/2026-11-23_proposta-struttura-portale.md`). Lo stile A chiaro è superato.

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
| `web/` | **Versione per patrimonio.postilva.it** (Vercel pubblica questa cartella): pagine, stile, librerie e caratteri sul nostro server, dati letti con `fetch` da `web/dati/` |

Pagine (hash): `#inizio` (home), `#mappa` (con filtri ed elenco a fianco), `#esempio`, `#metodo`, `#edificio-<foglio>-<particella>`.

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

## Notizie in home (fascia a scorrimento)

Le notizie della fascia stanno in `dati/notizie.json`, **la prima è la più recente**. Per aggiungerne una (per esempio dopo un sopralluogo) si copia un blocco e si cambia il testo, poi `python3 scripts/build_sito.py`. Campi: `data` (AAAA-MM-GG), `etichetta`, `titolo` (si può usare `<em>` per la parte colorata), `testo`, `pulsante` (`testo` e uno tra `filtro_uso` = piano | rudere | chiuso | in_uso | da_capire | non_noto, `zona` = tamburi, `href`), `link` (`testo`, `url`), `nota`. Nei testi `{chiave}` mette un numero calcolato (es. `{nel_piano}`, `{tamburi}`, `{cercati_online}`) e `{uso:in_uso}` il numero di edifici con quell'uso.

## Pubblicare su patrimonio.postilva.it

`python3 scripts/build_sito.py` scrive anche **`sito/web/`**: la versione per il dominio, con file separati e tutto servito dal nostro server (MapLibre, three.js e caratteri sono in `sito/src/vendor/`, scaricati il 23/11/2026; nessuna richiesta a Google o ad altri). Contiene `index.html`, `404.html` (stessa pagina), `vercel.json`, `robots.txt`, `sitemap.xml`, `favicon.svg`, `img/anteprima.jpg` (anteprima dei link). Dal 23/11/2026 il repository è **pubblico** e Vercel pubblica direttamente `sito/web/` (Root Directory del progetto Vercel = `sito/web`), dal ramo `main`.

Prima volta (Antonio):
1. Vercel: **Add New → Project →** importa `Postilva/mappa-spazi`; in **Root Directory** scegliere `sito/web`; Framework Preset **Other**, nessun comando di build → **Deploy**.
2. **Settings → Domains** → aggiungere `patrimonio.postilva.it`.
3. Hostinger, hPanel → **Domini → postilva.it → DNS**: aggiungere il record che indica Vercel (di solito **CNAME**, nome `patrimonio`, valore `cname.vercel-dns.com`). Il certificato https lo fa Vercel.
4. Google Search Console, proprietà di dominio postilva.it (esiste già): inviare `https://patrimonio.postilva.it/sitemap.xml`.

Per aggiornare: `python3 scripts/build_sito.py`, commit e push su `main`: Vercel ripubblica da solo. I push sugli altri rami creano anteprime, non toccano il sito pubblico.

## Contatti e modulo «Scrivici»

`dati/contatti.json`: `email`, `pec`, `modulo` (link del modulo Google) e `modulo_campo_scheda` (il codice `entry.NNNN` della domanda «Codice della scheda»). Finché `modulo` è vuoto, «Scrivici» e «Segnala un errore» aprono una mail all'indirizzo `email` (con il codice della scheda nell'oggetto). Quando c'è il modulo, aprono il modulo, con il codice della scheda già compilato; la pagina privacy aggiunge da sola la frase su Google Moduli. Dopo ogni modifica: `python3 scripts/build_sito.py`.


## Modifiche del 24/11/2026 (controllo dei difetti, UI e UX)

- **Ricerca**: senza maiuscole né accenti, parola per parola; «scuola» trova anche «scuole» (prima 7 risultati su 55 scuole).
- **Elenco a blocchi di 30** con «Mostra altri»; «Togli i filtri» quando non c'è nessun risultato. Quando si chiude il popup di un edificio, l'elenco torna in cima (Antonio).
- **Telefono**: i filtri stanno in un pannello «Filtri» richiudibile; la pagina della mappa non è più lunga 25 schermate.
- **Gruppi sulla mappa** con il bordo nel colore dell'uso più frequente (`clusterProperties`); a parità vince l'ordine di `USI`.
- **Scheda**: «Cercato online» subito sotto il titolo; foto, storia e costi mancanti in un solo riquadro «Cosa manca ancora».
- **Fascia delle notizie** con il fondo Tufo più pieno (32% invece di circa 15%: Antonio).
- **`404.html` è una pagina d'errore vera** (prima era una copia della home).
- **Icone** PNG da 48, 96, 192 px, `apple-touch-icon.png` e `favicon.ico`, disegnate da `build_sito.py` con Pillow e tenute in `sito/src/icone/`; **dati strutturati** con il nome del sito per Google.
- «Partecipa» porta a postilva.it/partecipa/. Testi: «edificio» al posto di «spazio», singolari corretti.

Non fatto: una pagina vera per ogni scheda (oggi sono indirizzi con `#`, che Google non indicizza).
- **Scheda di esempio completata** (24/11, Antonio): etichetta dell'uso «visto sul posto», «Cercato online» con due indicazioni inventate, contorno inventato in «Sul catasto», spazio tra avviso e disegni, storia senza doppia numerazione, strada del modello 3D non più bianca, «Segnala un errore» con una frase adatta all'esempio.
