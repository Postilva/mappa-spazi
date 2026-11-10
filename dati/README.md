# Dati

## `fonti/`

Fonte di partenza: *Elenco beni immobili – anno 2024*, Comune di Taranto, Direzione Patrimonio e Demanio – Politiche abitative (PDF, 107 pagine, esportato da Excel il 28/05/2024 secondo i metadati del file; ricevuto tramite il Drive di Postilva, cartella del T4). Pubblicazione ufficiale e presenza degli indirizzi: vedi `fonti/2026-11-10_verifica-elenco-2024.md`.

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

Una scheda per edificio, file `<id>.json`, dove `id` è l'identificativo del Comune. Il modello è `_modello.json`; i campi seguono il piano del sito (§3.3).

| Campo | Fonte |
|---|---|
| `id`, `foglio`, `particella`, `subalterno`, `categoria_catastale` | elenco 2024 |
| `indirizzo`, `lat`, `lon` | catasto e sopralluogo |
| `quartiere` | assegnato da noi |
| `stato` | sopralluogo: `in_uso`, `chiuso`, `abbandonato`, `rudere`, `da_verificare` |
| `data_sopralluogo`, `autori` | sopralluogo (solo nomi) |
| `foto` | sopralluogo |
| `storia` | ricerca, accesso agli atti (una fonte per ogni passaggio) |
| `stima` | tecnico (livello 1–3, forchetta, prezzario) |
| `idee_riuso` | incontri e segnalazioni |
| `modello_3d` | fotogrammetria |
| `fonti` | — |

Gli edifici senza posizione restano con `lat`/`lon` a `null` («da localizzare») e non vanno in mappa.
