# Dati

## `fonti/`

Fonte di partenza: *Elenco beni immobili – anno 2024*, Comune di Taranto, Direzione Patrimonio e Demanio – Politiche abitative (PDF, 107 pagine, esportato da Excel il 28/05/2024 secondo i metadati del file; ricevuto tramite il Drive di Postilva, cartella del T4). È la versione pubblicata dal Comune in Amministrazione Trasparente il 29/05/2024 (file identico) e **non contiene indirizzi**: dettagli e link in `fonti/2026-11-10_verifica-elenco-2024.md`.

| File | Contenuto |
|---|---|
| `2024_elenco-beni-immobili_comune-taranto.pdf` | PDF originale (SHA-256 `f83b7c0d4e8b91495f84b09c14ba4b72c68cd341022d327b2b48dd56005f1990`) |
| `elenco-immobili-2024.csv` | Estrazione completa in CSV (UTF-8, separatore virgola) |

### Come si rigenera il CSV

```
python3 scripts/estrai_elenco.py
```

Serve solo Python 3 e `pdftotext` (poppler-utils). Lo script salta le intestazioni ripetute su ogni pagina, gestisce il subalterno vuoto e le eventuali categorie andate a capo, stampa i controlli e termina con errore se trova righe non riconosciute (nessuna riga viene scartata in silenzio).

### Colonne

| Colonna | Contenuto |
|---|---|
| `id` | Identificativo del Comune, com'è nel PDF (gli zeri iniziali possono mancare) |
| `tipo` | `FAB` (catasto fabbricati) o `TER` (catasto terreni) |
| `foglio`, `particella`, `subalterno` | Riferimenti catastali; `subalterno` vuoto se assente |
| `categoria_codice` | Es. `A03`, `B05`; vuoto per i terreni |
| `categoria_descrizione` | Es. «Scuole, laboratori scientifici»; vuoto per i terreni |
| `pagina` | Pagina del PDF da cui viene la riga |

I terreni (`TER`) nel PDF hanno le stesse colonne ma senza categoria catastale: lo schema basta per entrambi i tipi, i campi assenti restano vuoti. I valori sono riportati com'è, senza correzioni.

### Totali e controlli (estrazione del 10/11/2026)

- **5.450 righe**: 4.515 `FAB` + 935 `TER`. Righe dati nel testo del PDF = righe nel CSV; righe non riconosciute: 0.
- Confronto con una seconda estrazione indipendente (`pdftotext -raw`): tutte le 5.450 righe ritrovate identiche; campione di 12 righe da pagine 1–107 controllato a vista.
- Identificativo = foglio (3 cifre) + particella (6 cifre) [+ subalterno (4 cifre)]: coerente per tutte le righe. Eccezioni di formato, coerenti anch'esse: 4 terreni dei fogli 26 e 27 (id di 8 cifre, zero iniziale perso) e 11 terreni con particella alfanumerica (es. `00000A`, id di 11 caratteri con foglio a 5 cifre).
- Un identificativo duplicato: `319004500` compare come `FAB` (F01 – Area urbana, pag. 88) e come `TER` (pag. 107): stessa particella nei due catasti. La coppia `id`+`tipo` è unica.
- Righe di forma insolita, riportate com'è: `1450004920040` (pag. 3) ha categoria scritta `A/3` invece di `A03`; `2460000370001` (pag. 97) è un terreno con subalterno `1`.

## `edifici/`

Una scheda per **edificio = particella catastale con fabbricati** (foglio + particella), file `<foglio>-<particella>.json`; `id` = `<foglio>-<particella>` (es. `201-59`). Le unità immobiliari dell'elenco 2024 (subalterni) stanno dentro la scheda nel campo `unita`. Il modello è `_modello.json`; i campi seguono il piano del sito (§3.3). Dal 10/11/2026 le schede coprono **tutta Taranto** e sono generate da `scripts/genera_schede_citta.py` (tutte le particelle localizzate, abitazioni comprese). Cosa va sulla mappa pubblica lo decide `scripts/build_sito.py` con la regola di `scripts/tipi.py`: solo i locali non residenziali. Le schede modificate a mano non vengono sovrascritte: lo script aggiorna solo i campi generati.

Attenzione: una particella non è sempre un edificio (può contenere più corpi di fabbrica, o essere un'area urbana o un lastrico solare). Lo si verifica al sopralluogo.

| Campo | Fonte |
|---|---|
| `id` (`<foglio>-<particella>`), `foglio`, `particella` | elenco 2024 |
| `unita` | elenco 2024: una voce per unità, con `id` del Comune, `subalterno`, `categoria`, `categoria_descrizione` |
| `categoria_catastale`, `descrizione` | elenco 2024: categoria prevalente tra le unità (la più frequente; a parità, il codice minore) e sua descrizione con il conteggio, es. «A04 – Abitazione di tipo popolare (1 di 2 unità)». Non è un nome |
| `nome` | sopralluogo o fonte citata; vuoto finché non c'è (mai inventato) |
| `indirizzo` | sopralluogo o fonte citata; vuoto finché non verificato |
| `lat`, `lon` | cartografia catastale (Agenzia delle Entrate, WFS INSPIRE, CC BY 4.0): baricentro del poligono della particella; da confermare al sopralluogo |
| `via_vicina` | OpenStreetMap: strada con nome più vicina al poligono della particella, entro 60 m (`nome`, `distanza_m`). **Non è l'indirizzo** e non è verificata (`verificata: false`) |
| `zona` | OpenStreetMap: quartiere o località più vicina, entro 3 km. Indicativa, non verificata |
| `quartiere` | assegnato da noi; oggi solo «Tamburi» per le particelle dentro il confine di lavoro |
| `superficie_m2`, `uso_originario` | sopralluogo e ricerca d'archivio |
| `stato` | sopralluogo: `in_uso`, `chiuso`, `abbandonato`, `rudere`, `da_verificare` |
| `data_sopralluogo`, `autori` | sopralluogo (solo nomi) |
| `foto` | sopralluogo |
| `storia` | ricerca, accesso agli atti (una fonte per ogni passaggio) |
| `stima` | tecnico (livello 1–3, forchetta, prezzario) |
| `idee_riuso` | incontri e segnalazioni |
| `modello_3d` | fotogrammetria |
| `fonti` | elenco delle fonti usate nella scheda: `titolo`, `ente`, `data`, `url`, eventuale `licenza`, `uso` (cosa viene da quella fonte) |

Le particelle senza posizione non hanno scheda: sono elencate in `citta/da-localizzare.csv` («da localizzare»). Se in futuro una scheda resta senza posizione, `lat`/`lon` sono `null` e non va in mappa.

## `citta/`

Posizioni di tutte le particelle con fabbricati dell'elenco 2024, dalla cartografia catastale (Agenzia delle Entrate, WFS INSPIRE, CC BY 4.0), con lo stesso metodo usato per i Tamburi (`tamburi/README.md`), esteso da `scripts/posizioni_citta.py` a tutti i fogli dell'elenco.

| File | Contenuto |
|---|---|
| `posizioni.csv` | Una riga per particella FAB: `lat`, `lon`, `metodo` (`baricentro_poligono`, `punto_interno` o `da_localizzare`), `area_m2`, mappe INSPIRE |
| `poligoni.geojson` | Poligoni delle particelle localizzate (semplificati a ~0,5 m) |
| `da-localizzare.csv` | Particelle dell'elenco non trovate nella cartografia: nessuna scheda, nessuna posizione stimata |

La cartella `tamburi/` resta com'era (confine di lavoro, fogli, primo filtro): è la base del quartiere pilota.
