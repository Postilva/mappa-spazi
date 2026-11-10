#!/usr/bin/env python3
"""Passo 5 - Schede JSON degli edifici dei Tamburi (una per particella FAB localizzata).

Input:  dati/tamburi/elenco-tamburi.csv, dati/tamburi/posizioni.csv, dati/edifici/_modello.json
Output: dati/edifici/<foglio>-<particella>.json  (solo particelle localizzate e dentro il confine)
        dati/tamburi/da-localizzare.csv          (particelle FAB senza posizione: nessuna scheda)
Regole: nessun dato inventato. nome e indirizzo vuoti, stato "da_verificare"; le unita'
(subalterni) dell'elenco 2024 sono raggruppate nel campo `unita`. `descrizione` riporta solo
la categoria catastale prevalente (quella con piu' unita'; a parita', il codice minore).
Le schede generate in precedenza dallo script vengono riscritte; quelle di particelle che non
rientrano piu' vengono cancellate solo se non sono state modificate a mano (ultima_modifica
uguale a DATA). Uso: python scripts/genera_schede.py   (solo libreria standard)
"""
import copy, csv, glob, json, os
from collections import Counter, defaultdict

DATA = "2026-11-10"
R = os.path.join(os.path.dirname(__file__), "..")
P = lambda *a: os.path.join(R, *a)
FONTI = [
    {"titolo": "Elenco beni immobili – anno 2024", "ente": "Comune di Taranto, Direzione Patrimonio e Demanio – Politiche abitative",
     "data": "2024-05-29", "url": "https://taranto.trasparenza-valutazione-merito.it/web/trasparenza/papca-g/-/papca/display/3570721",
     "uso": "identificativi, foglio, particella, subalterni e categorie catastali"},
    {"titolo": "Cartografia catastale – servizio WFS INSPIRE (CP:CadastralParcel)", "ente": "Agenzia delle Entrate",
     "data": DATA, "url": "https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php", "licenza": "CC BY 4.0",
     "uso": "posizione: baricentro (o punto interno) del poligono della particella, consultato il " + DATA},
]

modello = json.load(open(P("dati/edifici/_modello.json")))
unita = defaultdict(list)
for r in csv.DictReader(open(P("dati/tamburi/elenco-tamburi.csv"))):
    if r["tipo"] == "FAB":
        unita[(r["foglio"], r["particella"])].append(r)
pos = {(r["foglio"], r["particella"]): r for r in csv.DictReader(open(P("dati/tamburi/posizioni.csv")))}
assert set(pos) == set(unita), "posizioni.csv non allineato all'elenco: rilanciare il passo 4"

scritte, da_loc, fuori = set(), [], 0
for (f, p), us in sorted(unita.items(), key=lambda kv: (int(kv[0][0]), kv[0][1].zfill(8))):
    po = pos[(f, p)]
    cat = Counter(u["categoria_codice"] for u in us)
    if not po["lat"]:
        da_loc.append({"foglio": f, "particella": p, "unita": len(us),
                       "categorie": " ".join(f"{k}:{v}" for k, v in sorted(cat.items())), "motivo": "particella non trovata nella cartografia catastale WFS"})
        continue
    if po["dentro_tamburi"] != "si":
        fuori += 1
        continue
    top = sorted(cat.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    desc = next(u["categoria_descrizione"] for u in us if u["categoria_codice"] == top)
    s = copy.deepcopy(modello)
    s.update({
        "id": f"{f}-{p}", "foglio": f, "particella": p, "categoria_catastale": top,
        "descrizione": f"{top} – {desc} ({cat[top]} di {len(us)} unità)",
        "unita": [{"id": u["id"], "subalterno": u["subalterno"], "categoria": u["categoria_codice"],
                   "categoria_descrizione": u["categoria_descrizione"]}
                  for u in sorted(us, key=lambda u: (u["subalterno"].zfill(6), u["id"]))],
        "nome": "", "indirizzo": "", "lat": float(po["lat"]), "lon": float(po["lon"]),
        "quartiere": "Tamburi", "stato": "da_verificare", "storia": [], "fonti": FONTI, "ultima_modifica": DATA,
    })
    nome = P("dati/edifici", f"{f}-{p}.json")
    with open(nome, "w") as fh:
        json.dump(s, fh, ensure_ascii=False, indent=2); fh.write("\n")
    scritte.add(os.path.basename(nome))

for vecchio in glob.glob(P("dati/edifici", "*-*.json")):
    if os.path.basename(vecchio) not in scritte and json.load(open(vecchio)).get("ultima_modifica") == DATA:
        os.remove(vecchio)

with open(P("dati/tamburi/da-localizzare.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=["foglio", "particella", "unita", "categorie", "motivo"])
    w.writeheader(); w.writerows(da_loc)
print("schede:", len(scritte), "da localizzare:", len(da_loc), "fuori confine:", fuori)
