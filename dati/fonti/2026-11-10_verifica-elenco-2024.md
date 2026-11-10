# Verifica dell'elenco beni immobili 2024

*10/11/2026 · fonte esaminata: `dati/fonti/2024_elenco-beni-immobili_comune-taranto.pdf` (SHA-256 `f83b7c0d…1990`) e la sua estrazione `dati/fonti/elenco-immobili-2024.csv` (5.450 righe, vedi `dati/README.md`).*

## In breve

| Domanda | Risposta |
|---|---|
| L'elenco contiene indirizzi o toponimi? | **No.** Solo identificativo, tipo, foglio, particella, subalterno, categoria catastale. |
| È pubblicato ufficialmente dal Comune? | **Sì.** Amministrazione Trasparente del Comune di Taranto, «Beni immobili e gestione patrimonio › Patrimonio immobiliare», pubblicazione del 29/05/2024. Il file scaricato da lì è identico byte per byte al nostro. |
| Quante righe e di che tipo? | 5.450: 4.515 unità del catasto fabbricati (`FAB`) e 935 particelle del catasto terreni (`TER`). |
| Quanti fogli catastali? | 67 distinti (40 con fabbricati, 61 con terreni). |
| Quante particelle con fabbricati? | 539 coppie foglio+particella distinte per 4.515 unità. |

## a) Indirizzi

**Risposta: no, l'elenco non contiene indirizzi né toponimi.**

Prove (su tutto il file, 107 pagine):

1. Le colonne dichiarate in ogni pagina sono solo: Identificativo, Tipo, Foglio, Particella, Subalterno, Categoria catastale. L'estrazione riconosce il 100% delle righe con questo schema (0 righe non riconosciute).
2. Elenco di tutte le parole presenti nel testo del PDF (`pdftotext -raw`): oltre alle intestazioni («Comune di Taranto», «Direzione Patrimonio e Demanio - Politiche abitative», «Elenco beni immobili – anno 2024», nomi di colonna) compaiono solo parole delle descrizioni delle categorie catastali (es. «abitazione», «magazzini», «scuole», «area urbana») e le lettere delle particelle alfanumeriche (`A`, `B`, `D`, `E`, `Q`, `AM`, `AN`).
3. Ricerca dei termini «via, viale, piazza, piazzale, corso, largo, vico, contrada, strada, località, lungomare, traversa, quartiere, Tamburi, civico, n.»: 4 occorrenze, tutte la parola «corso» dentro le categorie F03 «Unità in corso di costruzione» e F04 «Unità in corso di definizione».
4. Il PDF non ha file allegati (`pdfdetach -list`: 0) e l'unica immagine è la stessa ripetuta su ogni pagina (stemma/intestazione, un solo oggetto).

Conseguenza per il progetto: indirizzo e posizione vanno ricavati dai riferimenti catastali (foglio/particella) con altre fonti — passo 4 del piano.

## b) Statistiche

### Righe per tipo

| Tipo | Righe | Note |
|---|---|---|
| FAB (catasto fabbricati) | 4.515 | 4.446 con subalterno, 69 senza |
| TER (catasto terreni) | 935 | 1 sola con subalterno (`2460000370001`) |
| **Totale** | **5.450** | |

### Edifici distinti

- **539** coppie foglio+particella distinte tra i fabbricati (`FAB`), a fronte di 4.515 unità immobiliari (subalterni).
- Attenzione: «particella distinta» non equivale a «edificio». Una particella può contenere più corpi di fabbrica e un edificio può stare su più particelle; inoltre alcune unità non sono edifici (F01 «Area urbana», F05 «Lastrico solare»). Il numero di edifici reali è **da verificare** sulle mappe catastali.
- Terreni: 935 particelle distinte; 4 coppie foglio+particella compaiono sia come `FAB` sia come `TER` (145/941, 300/362, 300/363, 319/4500).

### Conteggio per foglio catastale (67 fogli, ordinati per numero di righe)

La colonna «Particelle FAB» conta le coppie foglio+particella distinte tra i fabbricati. Quali fogli coprono il quartiere Tamburi è **da verificare** (passo 3).

| Foglio | Righe | FAB | TER | Particelle FAB distinte |
|---|---|---|---|---|
| 145 | 1161 | 1004 | 157 | 28 |
| 246 | 798 | 750 | 48 | 33 |
| 300 | 562 | 485 | 77 | 50 |
| 319 | 536 | 498 | 38 | 161 |
| 303 | 365 | 344 | 21 | 3 |
| 206 | 326 | 245 | 81 | 15 |
| 201 | 302 | 296 | 6 | 15 |
| 254 | 284 | 238 | 46 | 46 |
| 253 | 173 | 154 | 19 | 15 |
| 258 | 171 | 108 | 63 | 27 |
| 255 | 167 | 142 | 25 | 16 |
| 245 | 72 | 59 | 13 | 15 |
| 302 | 65 | 20 | 45 | 5 |
| 294 | 37 | 24 | 13 | 24 |
| 295 | 35 | 2 | 33 | 2 |
| 144 | 32 | 15 | 17 | 9 |
| 244 | 24 | 21 | 3 | 16 |
| 243 | 22 | 19 | 3 | 11 |
| 202 | 21 | 13 | 8 | 6 |
| 270 | 19 | 0 | 19 | 0 |
| 247 | 18 | 11 | 7 | 3 |
| 248 | 18 | 11 | 7 | 5 |
| 309 | 18 | 6 | 12 | 4 |
| 166 | 17 | 2 | 15 | 1 |
| 264 | 17 | 0 | 17 | 0 |
| 164 | 15 | 0 | 15 | 0 |
| 285 | 14 | 0 | 14 | 0 |
| 298 | 11 | 2 | 9 | 1 |
| 200 | 10 | 0 | 10 | 0 |
| 204 | 10 | 2 | 8 | 1 |
| 203 | 9 | 7 | 2 | 4 |
| 284 | 9 | 3 | 6 | 2 |
| 180 | 8 | 0 | 8 | 0 |
| 308 | 8 | 6 | 2 | 4 |
| 256 | 7 | 4 | 3 | 1 |
| 163 | 6 | 0 | 6 | 0 |
| 307 | 6 | 6 | 0 | 3 |
| 167 | 5 | 0 | 5 | 0 |
| 179 | 5 | 0 | 5 | 0 |
| 195 | 5 | 0 | 5 | 0 |
| 241 | 5 | 5 | 0 | 2 |
| 279 | 5 | 1 | 4 | 1 |
| 281 | 5 | 2 | 3 | 2 |
| 269 | 4 | 0 | 4 | 0 |
| 301 | 4 | 0 | 4 | 0 |
| 26 | 3 | 0 | 3 | 0 |
| 197 | 3 | 0 | 3 | 0 |
| 268 | 3 | 0 | 3 | 0 |
| 296 | 3 | 0 | 3 | 0 |
| 306 | 3 | 3 | 0 | 2 |
| 189 | 2 | 0 | 2 | 0 |
| 199 | 2 | 0 | 2 | 0 |
| 259 | 2 | 0 | 2 | 0 |
| 265 | 2 | 1 | 1 | 1 |
| 283 | 2 | 1 | 1 | 1 |
| 299 | 2 | 1 | 1 | 1 |
| 305 | 2 | 2 | 0 | 1 |
| 27 | 1 | 0 | 1 | 0 |
| 175 | 1 | 0 | 1 | 0 |
| 176 | 1 | 0 | 1 | 0 |
| 178 | 1 | 0 | 1 | 0 |
| 249 | 1 | 0 | 1 | 0 |
| 260 | 1 | 1 | 0 | 1 |
| 261 | 1 | 0 | 1 | 0 |
| 272 | 1 | 0 | 1 | 0 |
| 280 | 1 | 1 | 0 | 1 |
| 304 | 1 | 0 | 1 | 0 |

### Conteggio per categoria catastale (solo `FAB`, 4.515 righe)

Le descrizioni sono quelle del PDF. Una riga riporta il codice `A/3` invece di `A03` (stessa categoria, scritta diversamente nella fonte).

| Codice | Descrizione | Righe |
|---|---|---|
| A03 | Abitazione di tipo economico | 2810 |
| C02 | Magazzini e locali di deposito | 395 |
| C06 | Stalle, scuderie, rimesse e autorimesse | 362 |
| A05 | Abitazione di tipo ultrapopolare | 177 |
| A04 | Abitazione di tipo popolare | 172 |
| A02 | Abitazioni di tipo civile | 135 |
| C01 | Negozi e botteghe | 91 |
| B05 | Scuole, laboratori scientifici | 68 |
| F01 | Area urbana | 57 |
| F05 | Lastrico solare | 48 |
| F02 | Unità collabente | 40 |
| A10 | Uffici e studi privati | 28 |
| D01 | Opifici | 23 |
| E03 | Costruzioni e fabbricati per speciali esigenze pubbliche | 16 |
| B04 | Uffici pubblici | 12 |
| E07 | Fabbricati destinati all'uso pubblico dei culti | 9 |
| C03 | Laboratori per arti e mestieri | 8 |
| B01 | Collegi e convitti; educandati, ricoveri, orfanotrofi, ospizi, conventi, seminari e caserme | 8 |
| A07 | Abitazioni in villini | 8 |
| D08 | Fabbricati costruiti o adattati per speciali esigenze di una attività commerciale e non suscettibili di destinazione diversa senza radicali trasformazioni | 7 |
| D06 | Fabbricati e locali per esercizi sportivi | 5 |
| F06 | Fabbricato in attesa di dichiarazione | 5 |
| B06 | Biblioteche, pinacoteche, musei, gallerie, accademie, che non hanno sede in edifici della categoria A/9 | 5 |
| B02 | Case di cure ed ospedali | 5 |
| D03 | Teatri, cinematografi, sale per concerti e spettacoli e simili | 3 |
| F04 | Unità in corso di definizione | 3 |
| A08 | Abitazioni in ville | 3 |
| E01 | Stazioni per servizi di trasporto terrestri, marittimi ed aerei | 3 |
| E09 | Edifici a destinazione particolare non compresi nelle categorie precedenti del gruppo E | 2 |
| E04 | Recinti chiusi per speciali esigenze pubbliche | 1 |
| A/3 | Abitazione di tipo economico | 1 |
| F03 | Unità in corso di costruzione | 1 |
| C04 | Fabbricati e locali per esercizi sportivi | 1 |
| D10 | Fabbricati per funzioni produttive connesse alle attività agricole | 1 |
| D07 | Fabbricati costruiti o adattati per speciali esigenze di una attività industriale e non suscettibili di destinazione diversa senza radicali trasformazioni | 1 |
| C07 | Tettoie chiuse o aperte | 1 |

### F02 — Unità collabenti: 40 righe, 9 particelle, 4 fogli

Fogli: 245 (20 righe), 319 (11), 248 (7), 295 (2). In catasto la categoria F02 indica unità talmente degradate da non produrre reddito (riferimento normativo da verificare); lo stato reale va comunque verificato sul posto.

| Foglio | Particella | Righe | Subalterni |
|---|---|---|---|
| 245 | 2982 | 20 | 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28 |
| 248 | 828 | 7 | 2, 4, 5, 6, 7, 8, 9 |
| 295 | 2003 | 1 | — |
| 295 | 2031 | 1 | — |
| 319 | 512 | 4 | 1, 2, 3, 4 |
| 319 | 516 | 1 | 8 |
| 319 | 588 | 2 | 3, 4 |
| 319 | 589 | 2 | 2, 5 |
| 319 | 1438 | 2 | 3, 4 |

### F06 — Fabbricati in attesa di dichiarazione: 5 righe, 3 fogli

Fogli: 255 (3 righe), 144 (1), 206 (1).

| Foglio | Particella | Righe | Subalterni |
|---|---|---|---|
| 144 | 865 | 1 | — |
| 206 | 636 | 1 | — |
| 255 | 1539 | 1 | — |
| 255 | 1540 | 1 | — |
| 255 | 1541 | 1 | — |

## c) Pubblicazione ufficiale

**Trovata.** L'elenco 2024 è pubblicato dal Comune di Taranto nel portale Amministrazione Trasparente (linkato dal piè di pagina di https://www.comune.taranto.it/ come «Amministrazione trasparente»).

- Sezione: *Beni immobili e gestione patrimonio › Patrimonio immobiliare* — https://taranto.trasparenza-valutazione-merito.it/web/trasparenza/papca-g/-/papca/igrid/12275
- Scheda della pubblicazione: oggetto «ELENCO BENI IMMOBILI», periodo di pubblicazione 29/05/2024 – 31/12/2029, inserita e aggiornata il 29/05/2024, 2 allegati entrambi intitolati «ElencoImmobili2024 1» — https://taranto.trasparenza-valutazione-merito.it/web/trasparenza/papca-g/-/papca/display/3570721
- Verifica del contenuto (10/11/2026): i due allegati, scaricati dalla scheda, hanno lo stesso SHA-256 del nostro PDF (`f83b7c0d4e8b91495f84b09c14ba4b72c68cd341022d327b2b48dd56005f1990`): il file in nostro possesso è la versione ufficiale pubblicata. Coerente con i metadati del PDF (creato il 28/05/2024).
- Nella stessa sezione c'è anche un «ELENCO BENI IMMOBILI» pubblicato il 03/05/2023 (scheda https://taranto.trasparenza-valutazione-merito.it/web/trasparenza/papca-g/-/papca/display/2633925), non esaminato: utile in futuro per confronti tra anni.
- Nessun elenco più recente del 2024 risulta in quella sezione alla data della verifica.

Fonte da citare sul sito: *Comune di Taranto, Direzione Patrimonio e Demanio – Politiche abitative, «Elenco beni immobili – anno 2024», Amministrazione Trasparente, pubblicato il 29/05/2024, https://taranto.trasparenza-valutazione-merito.it/web/trasparenza/papca-g/-/papca/display/3570721*.

## Note sui dati

- Riferimenti catastali e categorie sono quelli dichiarati dal Comune nel 2024: non dicono nulla sullo stato reale degli immobili, sull'uso attuale né su chi li occupa.
- I valori sono riportati com'è; le anomalie di forma (una categoria `A/3`, un terreno con subalterno, un id ripetuto tra `FAB` e `TER`) sono descritte in `dati/README.md`.
