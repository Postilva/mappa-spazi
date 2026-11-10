# Tamburi — quartiere pilota

Elenco 2024 filtrato sui fogli catastali dei Tamburi, posizione delle particelle e base per le schede. Stato al 10/11/2026.

## Passo 3 — Confine e fogli catastali

### Confine di lavoro (`dati/geo/tamburi-confine.geojson`)

- **OpenStreetMap non ha un poligono dei Tamburi.** Nominatim (`q=Tamburi, Taranto`, `polygon_geojson=1`, e varianti «Quartiere Tamburi», «Tamburi Lido Azzurro», ricerca inversa a vari livelli) restituisce solo un **punto** `place=suburb` (nodo OSM 14197335999, 40.4948 N, 17.2283 E); la circoscrizione compare solo come sede (punto `townhall`). Nessun confine amministrativo sotto il livello comunale (relation 40452, Comune di Taranto).
- **Alternativa usata (fonte istituzionale):** ISTAT, *Basi territoriali 2021* per la Puglia ([R16_21.zip](https://www.istat.it/storage/cartografia/basi_territoriali/2021/R16_21.zip)), licenza [CC BY 4.0](https://www.istat.it/note-legali/). Il confine è l'unione delle **sezioni di censimento 2021** del Comune di Taranto che stanno:
  - nella **circoscrizione 2 «Tamburi-Lido Azzurro»** (area sub-comunale ISTAT `COM_ASC1 = 73027002`), **e**
  - nella località **«Taranto» – centro abitato** (`LOC21_ID = 7302710004`).
  Restano fuori il centro abitato di Lido Azzurro, le località produttive (tra cui «Agip Petroli-Ilva») e le case sparse della stessa circoscrizione.
- Risultato: 107 sezioni, **14.753 residenti (censimento 2021)**, 3,86 km², un solo poligono. Il punto OSM «Tamburi» cade dentro.
- **Da confermare dal team:** è un *confine di lavoro*, non il confine ufficiale di un quartiere (il Comune non ne pubblica uno in formato aperto che abbiamo trovato). Comprende anche l'area di Porta Napoli e la stazione, che fanno parte della circoscrizione; i bordi verso la Città Vecchia (circoscrizione 3) e verso la zona industriale vanno guardati insieme.
- Script: `scripts/confine_tamburi.py` (serve `pyshp`, `shapely`, `pyproj`: `scripts/requirements.txt`, ambiente locale non versionato). Se si cambia confine, si rilanciano in ordine gli script dei passi 3–5.

### Cartografia catastale: servizio usato e licenza

- Agenzia delle Entrate, **Cartografia catastale**, servizi INSPIRE:
  - WMS `https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php`
  - **WFS** `https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php` (layer `CP:CadastralZoning` = fogli, `CP:CadastralParcel` = particelle, con geometrie)
- **Licenza: CC BY 4.0**, dichiarata nel GetCapabilities di entrambi i servizi (`<Fees>CC BY 4.0</Fees>`; abstract WMS: «Licenza CC BY 4.0. L'Agenzia è l'amministrazione titolare dei dati. La citazione della titolarità è sempre obbligatoria in caso d'uso»). Attribuzione da usare: *© Agenzia delle Entrate – Cartografia catastale, CC BY 4.0*.
- **Perché il WFS e non il GetFeatureInfo del WMS:** il GetFeatureInfo funziona (formato identificativo verificato), ma dopo poche richieste risponde con l'eccezione `ERRX-2` per alcuni minuti: una griglia di migliaia di punti non è praticabile senza martellare il servizio. Il WFS restituisce direttamente i poligoni di fogli e particelle per riquadro (max 500 oggetti per richiesta), con poche decine di richieste in tutto.
- **Identificativi INSPIRE a Taranto:** `L049` (codice catastale del Comune) + sezione `A` (unica sezione presente a Taranto) + foglio a 4 cifre + allegato + sviluppo, poi `.particella`. Esempio: `L049A0202A0.129` = foglio 202, allegato A, particella 129. Allegati e sviluppi appartengono allo stesso foglio dell'elenco (che non ha la colonna sezione).
- Coordinate in EPSG:6706 (RDN2008); differenza da WGS84 sotto il metro, trascurabile per la mappa.

### Fogli che intersecano il confine (`fogli.csv`, `dati/geo/fogli-tamburi.geojson`)

Metodo: richiesta WFS `CP:CadastralZoning` sul riquadro del confine (+0,002°), unione per foglio di mappa principale, allegati e sviluppi, area dentro il confine calcolata in UTM 33N. Classi: `dentro` (≥ 99% dell'area), `a_cavallo`, `solo_bordo` (< 1% e < 2.000 m², nessuno). Script: `scripts/fogli_tamburi.py`.

| Foglio | Classe | Quota dentro il confine | Righe nell'elenco 2024 |
|---|---|---|---|
| 195 | a cavallo | 9,7% | 5 (solo TER) |
| 198 | a cavallo | 13,6% | 0 |
| 199 | a cavallo | 53,8% | 2 (solo TER) |
| 200 | **dentro** | 99,8% | 10 (solo TER) |
| 201 | a cavallo | 61,4% | 302 |
| 202 | a cavallo | 33,4% | 21 |
| 203 | **dentro** | 99,0% | 9 |
| 204 | a cavallo | 41,6% | 10 |
| 205 | a cavallo | 3,8% | 0 |
| 242 | a cavallo | 0,6% (4,6 ha) | 0 |
| 319 | a cavallo | 40,2% delle parti vicine* | 536 |

\* Il foglio 319 ha molti allegati (B…O); la quota è calcolata solo sulle parti restituite dal riquadro dei Tamburi. Gli allegati 319B e 319C sono interamente dentro, gli altri in parte o fuori: gran parte delle 161 particelle FAB del 319 potrebbe stare fuori dai Tamburi (Città Vecchia/Borgo). Per questo **al passo 4 ogni particella viene comunque controllata contro il confine**, a prescindere dalla classe del foglio.

### Filtro dell'elenco (`elenco-tamburi.csv`)

Tutte le righe dell'elenco 2024 dei fogli `dentro` e `a_cavallo` (colonne originali + `classe_foglio`).

- **895 righe**: 816 FAB + 79 TER; fogli presenti: 195, 199, 200, 201, 202, 203, 204, 319.
- **187 particelle FAB distinte** (foglio+particella).
- **Per il sito si usano solo i fabbricati (FAB).** I terreni (TER) restano nel CSV ma fuori mappa: sono particelle del catasto terreni (aree, non edifici) e non hanno categoria.
- **F02 «Unità collabente» presente:** 11 unità su 5 particelle. **F06 assente.** (Da ricordare: «particella» non vuol dire «edificio»; F01 area urbana e F05 lastrico solare non sono edifici.)

Per categoria (solo FAB, prima del controllo di posizione):

| Cat. | Descrizione | Unità | Particelle |
|---|---|---|---|
| A02 | Abitazioni di tipo civile | 5 | 4 |
| A03 | Abitazione di tipo economico | 311 | 26 |
| A04 | Abitazione di tipo popolare | 139 | 60 |
| A05 | Abitazione di tipo ultrapopolare | 177 | 71 |
| B01 | Collegi e convitti, ricoveri, conventi… | 1 | 1 |
| B02 | Case di cura ed ospedali | 1 | 1 |
| B04 | Uffici pubblici | 4 | 3 |
| B05 | Scuole, laboratori scientifici | 10 | 8 |
| B06 | Biblioteche, musei, gallerie, accademie… | 4 | 4 |
| C01 | Negozi e botteghe | 50 | 34 |
| C02 | Magazzini e locali di deposito | 29 | 20 |
| C03 | Laboratori per arti e mestieri | 4 | 4 |
| C06 | Stalle, scuderie, rimesse e autorimesse | 6 | 4 |
| C07 | Tettoie chiuse o aperte | 1 | 1 |
| D01 | Opifici | 5 | 5 |
| D03 | Teatri, cinematografi, sale… | 1 | 1 |
| E01 | Stazioni per servizi di trasporto | 3 | 3 |
| E03 | Costruzioni per speciali esigenze pubbliche | 4 | 4 |
| F01 | Area urbana | 6 | 6 |
| F02 | Unità collabente | 11 | 5 |
| F03 | Unità in corso di costruzione | 1 | 1 |
| F05 | Lastrico solare | 43 | 33 |

(Una particella può avere unità di più categorie: la colonna «Particelle» non si somma.)

## Passo 4 — Posizione delle particelle FAB (`posizioni.csv`)

### Metodo

Script `scripts/posizioni_tamburi.py` (modulo comune `scripts/catasto.py`; cache delle risposte in `.cache/catasto/`, non versionata).

1. **Fogli completi.** WFS `CP:CadastralZoning` su un riquadro ampio (40,45–40,52 N, 17,15–17,30 E) per avere *tutte* le parti (mappa principale, allegati, sviluppi) dei fogli con fabbricati: 201, 202, 203, 204, 319 → 28 parti.
2. **Poligoni delle particelle.** WFS `CP:CadastralParcel` a tasselli di 0,004° (~400 m) sul riquadro di quelle parti (17,2159–17,2523 E, 40,4633–40,5081 N): 152 richieste, una ogni 10 s; 14 tasselli vuoti (mare); 7 tasselli rifiutati dal servizio («Richiesta non valida», sempre sugli stessi riquadri, probabilmente per dimensione della risposta) e quindi divisi in quattro.
3. **Posizione.** Per ogni coppia foglio+particella FAB dell'elenco: unione dei poligoni con lo stesso foglio (qualsiasi allegato) e lo stesso numero di particella; posizione = **baricentro del poligono** (`baricentro_poligono`). Se il baricentro fosse caduto fuori dal poligono (forme a L o a C) si sarebbe usato un punto interno garantito (`punto_interno`): non è successo per nessuna particella.
4. **Confine.** Ogni punto è controllato contro il confine di lavoro (`dentro_tamburi` = `si`/`no`), per tutte le particelle e non solo per i fogli «a cavallo».

Non si è usata la griglia di GetFeatureInfo: il WFS dà direttamente i poligoni, quindi la posizione è esatta rispetto alla mappa catastale e servono molte meno richieste. Per questo la colonna `n_punti` della griglia è sostituita da `n_poligoni` (poligoni della particella; 1 per tutte).

Colonne: `foglio`, `particella`, `lat`, `lon` (WGS84/RDN2008, 7 decimali), `metodo`, `n_poligoni`, `area_m2` (area della particella sulla mappa, UTM 33N), `mappe_inspire` (foglio/allegato in cui sta), `dentro_tamburi`.

### Risultati

| | Particelle FAB | Unità |
|---|---|---|
| Nell'elenco filtrato (passo 3) | 187 | 816 |
| Localizzate | 166 | 717 |
| — dentro il confine dei Tamburi → **in mappa** | **29** | **323** |
| — fuori dal confine → fuori dalla mappa del quartiere | 137 (tutte del foglio 319) | 394 |
| **Non localizzate** («da localizzare», lat/lon vuoti) | **21** (tutte del foglio 319) | 99 |

- **Dentro, per foglio:** 201 → 15, 202 → 6, 203 → 4, 204 → 1, 319 → 3.
- **Il foglio 319 è quasi tutto fuori:** 137 delle 140 particelle localizzate cadono fuori dal confine (zona Città Vecchia/Borgo, circoscrizione 3). Restano nei dati ma non nella mappa dei Tamburi; serviranno se si estende la mappa ad altri quartieri.
- **Non localizzate (21, foglio 319):** 512, 514–517, 519–524, 659, 661, 666, 667, 670, 672, 905, 939, 63557, 63559. Il numero di particella dell'elenco non esiste (oggi) nella cartografia: possibili soppressioni/fusioni dopo il 2024, numerazioni del catasto fabbricati non allineate alla mappa, o refusi dell'elenco. **Da verificare** con una visura catastale o con la Direzione Patrimonio. Tra queste ci sono **tutte le 5 particelle F02 «unità collabente»** dell'elenco filtrato: per ora nessun rudere catastale finisce in mappa. Non è stata stimata nessuna posizione approssimata.
- **Categorie delle 29 particelle in mappa (unità):** A03 291, B05 8, A04 3, C01 3, D01 3, A02 2, C02 2, E03 2, F01 2, B01 1, B02 1, B04 1, B06 1, C03 1, F03 1, F05 1.

### Controllo indipendente (`verifica-posizioni.csv`)

Script `scripts/verifica_posizioni.py`: per un campione di 6 particelle localizzate (seme fisso, una per foglio più una), richiesta **GetFeatureInfo al WMS** (servizio diverso dal WFS usato per calcolare la posizione) nel punto calcolato, layer `CP.CadastralParcel`, EPSG:25833.

| Foglio | Particella | Risposta del WMS | Esito |
|---|---|---|---|
| 201 | 2234 | `L049A020100.2234` | ok |
| 201 | 247 | `L049A020100.247` | ok |
| 203 | 3295 | `L049A0203B0.3295` | ok |
| 204 | 914 | `L049A020400.914` | ok |
| 319 | 857 | `L049A0319D0.857` | ok |
| 202 | 179 | nessuna risposta (`ERRX-2` / connessione interrotta, anche dopo 4 tentativi in ~15 min) | non verificato |

**5 su 5 risposte ottenute coincidono** (stessa particella, stesso foglio). Il WMS limita molto le richieste: anche a una richiesta ogni 75 s risponde spesso `ERRX-2` o chiude la connessione. Lo script riprende da dove si era fermato (non ripete i campioni già verificati).

### Licenza

Geometrie e identificativi: © Agenzia delle Entrate – Cartografia catastale, **CC BY 4.0** (vedi passo 3). Le posizioni sono un'elaborazione Postilva (baricentro) e vanno confermate al sopralluogo: il baricentro di una particella grande può cadere in un cortile o tra più corpi di fabbrica.

## Passo 5 — Schede JSON (`dati/edifici/`)

Script `scripts/genera_schede.py` (solo libreria standard). Rilanciabile: riscrive le schede generate e toglie quelle non più valide solo se non sono state modificate a mano (`ultima_modifica` diversa dalla data dello script).

- **29 schede**, una per particella FAB localizzata e dentro il confine: `dati/edifici/<foglio>-<particella>.json`, `id` = `<foglio>-<particella>` (fogli 201: 15, 202: 6, 203: 4, 204: 1, 319: 3).
- Le unità dell'elenco 2024 (subalterni) sono raggruppate nel campo `unita` (`id` del Comune, `subalterno`, `categoria`, `categoria_descrizione`): 323 unità in tutto.
- `categoria_catastale` e `descrizione` = categoria prevalente tra le unità, con il conteggio (es. `203-18`: «A04 – Abitazione di tipo popolare (1 di 2 unità)»; a parità di unità vale il codice minore). Non è un nome.
- `nome` = "", `indirizzo` = "", `stato` = "da_verificare", `quartiere` = "Tamburi", `lat`/`lon` dal passo 4, `ultima_modifica` = "2026-11-10"; `fonti` = elenco 2024 (Amministrazione Trasparente) + cartografia catastale (WFS, CC BY 4.0). Tutto il resto vuoto/null come nel modello.
- **Nessuna scheda** per le 21 particelle non localizzate: sono in `da-localizzare.csv` (foglio, particella, numero di unità, categorie, motivo). Nessuna scheda nemmeno per le 137 particelle localizzate fuori confine (restano in `posizioni.csv`).
- Il modello `dati/edifici/_modello.json` ha ora i campi `descrizione` e `unita`; il campo `subalterno` di primo livello è stato tolto (sta dentro `unita`). Dettagli in `dati/README.md`.
