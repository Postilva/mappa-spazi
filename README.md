# Mappa degli spazi pubblici di Taranto

*Nome di lavoro, da scegliere. Repository satellite dell'associazione Postilva, tavolo T4 (Quartieri, Spazi e Mare).*

Mappa pubblica online degli edifici del Comune di Taranto: per ogni edificio una scheda con stato verificato sul posto, storia, stima di massima dei costi di riapertura, idee di riuso ed eventuale modello 3D.

**Quartiere pilota: Tamburi.**

## Dove sono i documenti

Piano, stile grafico, decisioni e stato del progetto stanno nell'hub, `Postilva/postilva-hub`, cartella `progetti/mappa-spazi/`:

- `2026-11-10_piano-sito.md`: cosa fa il sito, dati, tecnologia, fasi, KPI, rischi.
- `stile.md`: colori, simboli degli stati, font, ordine della scheda (stile «A · Istituzionale chiaro»).

Questo repository contiene solo **dati e codice**.

## Struttura

| Cartella | Contenuto |
|---|---|
| `dati/fonti/` | Fonti di partenza (elenco immobili del Comune 2024, estrazioni in CSV) |
| `dati/edifici/` | Una scheda JSON per edificio (modello in `dati/edifici/_modello.json`) |
| `foto/` | Foto dei sopralluoghi, compresse (max ~300 KB), una cartella per edificio |
| *sito* | da creare: la tecnologia si sceglie dopo aver visto il codice del sito bonifiche |

## Regole

- Ogni dato ha una fonte; quello che non è verificato si scrive «da verificare».
- Ogni stima dei costi porta la dicitura «stima parametrica di massima, non perizia».
- Nessuna indicazione su come entrare negli edifici; sopralluoghi solo dall'esterno o con autorizzazione scritta.
- Foto senza persone riconoscibili né targhe.
- Nelle schede, degli autori dei sopralluoghi solo il nome: niente contatti.
- Mai committare password, token o credenziali.

## Stato

In avvio (10/11/2026): struttura del repository; caricati l'elenco immobili 2024 del Comune e la sua estrazione in CSV (`dati/fonti/`). Nessun codice del sito ancora.

## Stato del lavoro

1. [x] Estrazione dell'elenco 2024 in CSV — fatto 10/11/2026 (`scripts/estrai_elenco.py`, `dati/fonti/elenco-immobili-2024.csv`, 5.450 righe)
2. [x] Verifiche sulla fonte (indirizzi, statistiche, pubblicazione ufficiale) — fatto 10/11/2026 (`dati/fonti/2026-11-10_verifica-elenco-2024.md`)
3. [x] Fogli catastali dei Tamburi e filtro dell'elenco — fatto 10/11/2026 (confine di lavoro ISTAT 2021, circoscrizione 2 ∩ centro abitato, **da confermare**; 11 fogli intersecano il confine; `dati/tamburi/elenco-tamburi.csv`: 895 righe, 187 particelle FAB)
4. [x] Posizione degli edifici — fatto 10/11/2026 (poligoni WFS dell'Agenzia delle Entrate, CC BY 4.0: 166 particelle localizzate, 29 dentro i Tamburi, 137 fuori confine, 21 da localizzare; controllo WMS 5/5 ok; `dati/tamburi/posizioni.csv`)
5. [x] Schede JSON degli edifici — fatto 10/11/2026 (29 schede `dati/edifici/<foglio>-<particella>.json` con 323 unità, tutte `da_verificare`, senza nome né indirizzo)
6. [x] Sito statico MapLibre, stile A — fatto 10/11/2026 (niente Astro: generatore Python `scripts/build_sito.py`, sorgenti in `sito/src/`, mappa di base vettoriale incorporata; vedi `sito/README.md`)
7. [x] Pagine mappa, scheda, elenco, metodo — fatto 10/11/2026 (`sito/dist/pagina-claude.html`, file unico; `sito/index.html` per hosting normale)
8. [x] Controllo da smartphone e accessibilità — fatto 10/11/2026 (Playwright 390×844 e 1280×800: console pulita, niente scroll orizzontale, 29 punti, target ≥ 44 px)
9. [x] Pubblicazione come pagina privata claude.ai (10/11/2026): https://claude.ai/artifact/EzPvgu5dKgkUJwo3YYgVwb (privata: si condivide dal menu Condividi). Prossimo: revisione del team, conferma del confine, sopralluoghi.
