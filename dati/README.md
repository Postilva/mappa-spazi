# Dati

## `fonti/`

Fonte di partenza: *Elenco beni immobili – anno 2024*, Comune di Taranto, Direzione Patrimonio e Demanio – Politiche abitative (PDF, 107 pagine; oggi sul Drive di Postilva, cartella del T4). Da verificare: pubblicazione ufficiale (es. Amministrazione Trasparente) e presenza degli indirizzi.

Qui vanno il PDF originale e la sua estrazione in CSV, con lo script che la produce.

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
