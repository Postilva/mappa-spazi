#!/usr/bin/env python3
"""Estrae in CSV l'«Elenco beni immobili – anno 2024» del Comune di Taranto.

Uso (dalla radice del repository):

    python3 scripts/estrai_elenco.py
    python3 scripts/estrai_elenco.py --pdf <file.pdf> --csv <file.csv>

Richiede solo Python 3 (libreria standard) e `pdftotext` (poppler-utils).

Il PDF è un'esportazione da Excel: ogni pagina ha un'intestazione ripetuta
(«Comune di Taranto … pag. N di 107», «Direzione Patrimonio…», «ELENCO BENI
IMMOBILI – ANNO 2024», riga dei nomi di colonna) seguita da righe dati con:

    Identificativo  Tipo  Foglio  Particella  [Subalterno]  [Categoria catastale]

- Tipo FAB (fabbricati): categoria catastale presente; subalterno a volte vuoto.
- Tipo TER (terreni): nessuna categoria catastale; di norma nessun subalterno
  (una sola riga TER ha il subalterno). Lo schema del CSV basta per entrambi:
  i campi assenti restano vuoti.

Ogni valore è riportato com'è nel PDF (nessuna correzione). Le righe che non
sono né intestazione né dati né continuazione di una categoria andata a capo
vengono stampate come «non riconosciute» e fanno terminare lo script con
codice di uscita 1: nessuna riga viene scartata in silenzio.

Lo script stampa anche i controlli: righe dati nel testo vs righe nel CSV,
identificativi duplicati, coerenza identificativo ↔ foglio/particella/subalterno.
"""

import argparse
import csv
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
PDF_PREDEFINITO = RADICE / "dati/fonti/2024_elenco-beni-immobili_comune-taranto.pdf"
CSV_PREDEFINITO = RADICE / "dati/fonti/elenco-immobili-2024.csv"

COLONNE = [
    "id", "tipo", "foglio", "particella", "subalterno",
    "categoria_codice", "categoria_descrizione", "pagina",
]

# Righe di intestazione ripetute su ogni pagina.
INTESTAZIONI = [
    re.compile(r"^\s*Comune di Taranto\s+pag\.\s*\d+\s+di\s+\d+\s*$"),
    re.compile(r"^\s*Direzione Patrimonio e Demanio - Politiche abitative\s*$"),
    re.compile(r"^\s*ELENCO BENI IMMOBILI\s+–\s+ANNO\s+\d{4}\s*$"),
    re.compile(r"^\s*Identificativo\s+Tipo\s+Foglio\s+Particella\s+Subalterno\s+Categoria catastale\s*$"),
]
RE_PAGINA = re.compile(r"pag\.\s*(\d+)\s+di\s+(\d+)")

# Riga dati. Il codice di categoria è di norma «A03», ma nel PDF compare anche
# «A/3» (una riga): si accettano entrambe le forme e si riporta il valore com'è.
RE_DATI = re.compile(
    r"^\s*(?P<id>[0-9A-Z]+)\s+(?P<tipo>[A-Z]{3})\s+(?P<foglio>\d+)\s+(?P<particella>[0-9A-Z]+)"
    r"(?:\s+(?P<sub>\d+))?"
    r"(?:\s+(?P<cod>[A-Z]/?\d{1,2})\s+-\s+(?P<desc>.*?))?\s*$"
)
# Possibile continuazione di una descrizione di categoria andata a capo:
# solo testo, senza numeri iniziali né tipo.
RE_CONTINUAZIONE = re.compile(r"^\s+[^\d\s].*$")
# Riga candidata a essere dati (usata per il conteggio indipendente).
RE_CANDIDATA = re.compile(r"^\s*[0-9A-Z]*\d[0-9A-Z]*\s+(FAB|TER)\b")


def testo_pdf(pdf: Path) -> str:
    try:
        uscita = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), "-"],
            check=True, capture_output=True,
        )
    except FileNotFoundError:
        sys.exit("Errore: serve `pdftotext` (pacchetto poppler-utils).")
    return uscita.stdout.decode("utf-8")


def estrai(testo: str):
    righe, non_riconosciute = [], []
    candidate = 0
    pagine = testo.split("\f")
    if pagine and not pagine[-1].strip():
        pagine = pagine[:-1]
    for n_pag, pagina in enumerate(pagine, start=1):
        m = RE_PAGINA.search(pagina)
        if m and int(m.group(1)) != n_pag:
            non_riconosciute.append((n_pag, f"[numero pagina stampato {m.group(1)} ≠ {n_pag}]"))
        ultima = None
        for riga in pagina.split("\n"):
            if not riga.strip():
                continue
            if any(r.match(riga) for r in INTESTAZIONI):
                continue
            if RE_CANDIDATA.match(riga):
                candidate += 1
            m = RE_DATI.match(riga)
            if m and m.group("tipo") in ("FAB", "TER"):
                ultima = {
                    "id": m.group("id"),
                    "tipo": m.group("tipo"),
                    "foglio": m.group("foglio"),
                    "particella": m.group("particella"),
                    "subalterno": m.group("sub") or "",
                    "categoria_codice": m.group("cod") or "",
                    "categoria_descrizione": (m.group("desc") or "").strip(),
                    "pagina": str(n_pag),
                }
                righe.append(ultima)
                continue
            if ultima and ultima["categoria_descrizione"] and RE_CONTINUAZIONE.match(riga):
                ultima["categoria_descrizione"] += " " + riga.strip()
                continue
            non_riconosciute.append((n_pag, riga.rstrip()))
    return righe, non_riconosciute, candidate, len(pagine)


def id_coerente(r) -> bool:
    """L'identificativo è foglio + particella (6 cifre) [+ subalterno (4 cifre)],
    con il foglio a 3 cifre (gli zeri iniziali dell'id possono mancare) oppure,
    per le particelle alfanumeriche dei terreni, a 5 cifre."""
    f, p, s = r["foglio"], r["particella"], r["subalterno"]
    attesi = []
    for larg_f in (3, 5):
        base = f.zfill(larg_f) + p.zfill(6)
        attesi.append(base + (s.zfill(4) if s else ""))
    return r["id"] in attesi or r["id"].zfill(len(attesi[0])) == attesi[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", type=Path, default=PDF_PREDEFINITO)
    ap.add_argument("--csv", type=Path, default=CSV_PREDEFINITO)
    a = ap.parse_args()

    righe, non_ric, candidate, n_pagine = estrai(testo_pdf(a.pdf))

    a.csv.parent.mkdir(parents=True, exist_ok=True)
    with open(a.csv, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLONNE)
        w.writeheader()
        w.writerows(righe)

    print(f"Pagine lette: {n_pagine}")
    print(f"Righe dati candidate nel testo (id + FAB/TER): {candidate}")
    print(f"Righe scritte nel CSV: {len(righe)}  → {a.csv}")
    print("Per tipo:", dict(Counter(r["tipo"] for r in righe)))

    dup = {k: v for k, v in Counter(r["id"] for r in righe).items() if v > 1}
    print(f"Identificativi duplicati: {len(dup)}")
    for k, v in sorted(dup.items()):
        print(f"  {k} ×{v}")

    incoerenti = [r for r in righe if not id_coerente(r)]
    print(f"Identificativi non coerenti con foglio/particella/subalterno: {len(incoerenti)}")
    for r in incoerenti:
        print("  ", r)

    anomale = [r for r in righe if r["categoria_codice"] and not re.fullmatch(r"[A-Z]\d{2}", r["categoria_codice"])]
    anomale += [r for r in righe if r["tipo"] == "TER" and r["subalterno"]]
    anomale += [r for r in righe if r["tipo"] == "FAB" and not r["categoria_codice"]]
    print(f"Righe con forma insolita (riportate com'è): {len(anomale)}")
    for r in anomale:
        print("  ", r)

    print(f"Righe non riconosciute: {len(non_ric)}")
    for p, t in non_ric:
        print(f"  pag. {p}: {t}")

    ok = not non_ric and candidate == len(righe)
    print("ESITO:", "OK" if ok else "DA CONTROLLARE")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
