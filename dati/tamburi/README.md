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
