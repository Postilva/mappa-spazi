# Mappa degli spazi pubblici di Taranto

*Nome di lavoro, da scegliere. Repository satellite dell'associazione Postilva, tavolo T4 (Quartieri, Spazi e Mare).*

Mappa pubblica online degli edifici del Comune di Taranto: per ogni edificio una scheda con stato verificato sul posto, storia, stima di massima dei costi di riapertura, idee di riuso ed eventuale modello 3D.

**Ambito: tutta Taranto** (dal 10/11/2026), solo locali non residenziali; i Tamburi restano il primo quartiere da verificare sul posto.

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
10. [x] Mappa di base OpenStreetMap (10/11/2026): strade con i nomi, edifici, ferrovia, verde e mare al posto degli isolati catastali (`scripts/scarica_base_osm.py`, `sito/dati/osm/`); pubblicata sullo stesso link.
11. [x] Estensione a tutta Taranto e pagine «piattaforma» (10–11/11/2026). Sulla mappa pubblica solo le particelle con almeno un locale non residenziale (`scripts/tipi.py`): niente abitazioni né pertinenze. Nuove pagine «Cerco uno spazio» (modulo in **bozza, non attivo**: non salva e non invia) e «Scheda di esempio» (edificio **inventato**, con modello 3D). Posizioni: `scripts/posizioni_citta.py` → `dati/citta/`. Cartografia catastale letta su tutti i 420 riquadri, tranne 3 quadrati di 0,001° rifiutati dal servizio (elenco nel log dello script). **488 particelle su 539 localizzate**, 51 in `dati/citta/da-localizzare.csv` (24 hanno locali di interesse, 28 locali; 21 sono del foglio 319). In mappa: **203 particelle, 340 locali**, tutti «da verificare». Con `SOLO_CACHE=1` lo script non interroga il servizio.
12. [x] Solo censimento (23/11/2026, decisione di Antonio): tolti «Cerco uno spazio», il modulo in bozza e i pulsanti «Mi interessa» (mappa e scheda); nuovo titolo della home. Ripubblicato sullo stesso link.
13. [x] Ricerca online e nuovo stile (23/11/2026): `dati/ricerca/` unito alle schede (sezione «Cercato online», 113 immobili); sito portato nello stile del portale con il nome «Vuoti a rendere» (home con censimento in 5 passaggi e immobili segnalati, mappa scura con quadratini, filtri ed elenco a fianco, schede su due colonne). Ripubblicato sullo stesso link.
14. [x] «Patrimonio comune» e versione per il dominio (23/11/2026): nuovo nome, colori per uso, notizie in home (`dati/notizie.json`), pagina Privacy e crediti, `sito/web/` per patrimonio.postilva.it (tutto dal nostro server). Repository reso pubblico da Antonio il 23/11/2026; Vercel pubblica `sito/web/` dal ramo `main`.
