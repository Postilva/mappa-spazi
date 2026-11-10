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
3. [ ] Fogli catastali dei Tamburi e filtro dell'elenco — **prossimo: passo 3**
4. [ ] Posizione degli edifici
5. [ ] Schede JSON degli edifici
6. [ ] Sito statico Astro + MapLibre, stile A
7. [ ] Pagine mappa, scheda, elenco, metodo
8. [ ] Controllo da smartphone e accessibilità
9. [ ] Pubblicazione come pagina privata claude.ai
