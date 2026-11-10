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

In avvio (10/11/2026): struttura del repository; nessun dato né codice ancora caricato.
