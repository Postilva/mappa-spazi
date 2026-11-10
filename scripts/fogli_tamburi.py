#!/usr/bin/env python3
"""Passo 3b - Fogli catastali che intersecano il confine dei Tamburi e filtro dell'elenco 2024.

Input:  dati/geo/tamburi-confine.geojson (da scripts/confine_tamburi.py)
        dati/fonti/elenco-immobili-2024.csv
Fonte:  WFS INSPIRE Agenzia delle Entrate, layer CP:CadastralZoning (fogli, allegati, sviluppi)
Output: dati/tamburi/fogli.csv, dati/geo/fogli-tamburi.geojson, dati/tamburi/elenco-tamburi.csv

Classificazione di ogni foglio (unione di foglio + allegati + sviluppi):
  dentro       >= 99% dell'area del foglio dentro il confine
  a_cavallo    parte dentro e parte fuori
  solo_bordo   intersezione < 1% del foglio e < 2.000 m2: tocca il confine solo per
               differenze di disegno tra le due cartografie -> escluso dal filtro
Uso: python scripts/fogli_tamburi.py   (serve shapely e pyproj, vedi scripts/requirements.txt)
"""
import csv, json, os, sys, warnings
from collections import Counter, defaultdict
warnings.filterwarnings("ignore", category=DeprecationWarning)
from shapely.geometry import shape, Polygon, mapping
from shapely.ops import unary_union, transform
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(__file__))
import catasto

R = os.path.join(os.path.dirname(__file__), "..")
P = lambda *a: os.path.join(R, *a)
utm = Transformer.from_crs("EPSG:4326", "EPSG:32633", always_xy=True).transform

confine = shape(json.load(open(P("dati/geo/tamburi-confine.geojson")))["features"][0]["geometry"])
confine_m = transform(utm, confine)
lon0, lat0, lon1, lat1 = confine.bounds
m = 0.002
feats, nm, nr = catasto.get_features("CP:CadastralZoning", (lat0 - m, lon0 - m, lat1 + m, lon1 + m))
assert nm == nr, (nm, nr)

parti = defaultdict(list)
for f in feats:
    d = catasto.scomponi(f["ref"])
    if not d or d["comune"] != "L049":
        continue  # altri comuni (es. M298 Statte)
    for rings in f["poligoni"]:
        parti[d["foglio_n"]].append((f["ref"], Polygon(rings[0], rings[1:]).buffer(0)))

righe, out_geo = [], []
for fg in sorted(parti):
    g = unary_union([p for _, p in parti[fg]])
    gm = transform(utm, g)
    inter = gm.intersection(confine_m).area
    quota = inter / gm.area
    if quota >= 0.99:
        cl = "dentro"
    elif inter > 0 and (quota >= 0.01 or inter >= 2000):
        cl = "a_cavallo"
    elif inter > 0:
        cl = "solo_bordo"
    else:
        continue
    refs = sorted({r for r, _ in parti[fg]})
    righe.append({"foglio": fg, "classe": cl, "quota_dentro": round(quota, 4),
                  "area_foglio_m2": round(gm.area), "area_dentro_m2": round(inter),
                  "mappe_inspire": " ".join(refs)})
    out_geo.append({"type": "Feature", "properties": {"foglio": fg, "classe": cl, "quota_dentro": round(quota, 4)},
                    "geometry": mapping(transform(lambda x, y, z=None: (round(x, 7), round(y, 7)), g))})

with open(P("dati/tamburi/fogli.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(righe[0]))
    w.writeheader(); w.writerows(righe)
json.dump({"type": "FeatureCollection",
           "fonte": "Agenzia delle Entrate - Cartografia catastale, servizio WFS INSPIRE (CP:CadastralZoning), consultato il 2026-11-10; licenza CC BY 4.0",
           "features": out_geo}, open(P("dati/geo/fogli-tamburi.geojson"), "w"), ensure_ascii=False)

fogli_ok = {r["foglio"] for r in righe if r["classe"] in ("dentro", "a_cavallo")}
classe = {r["foglio"]: r["classe"] for r in righe}
rows = list(csv.DictReader(open(P("dati/fonti/elenco-immobili-2024.csv"))))
sel = [r for r in rows if r["foglio"].isdigit() and int(r["foglio"]) in fogli_ok]
with open(P("dati/tamburi/elenco-tamburi.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]) + ["classe_foglio"])
    w.writeheader()
    for r in sel:
        w.writerow({**r, "classe_foglio": classe[int(r["foglio"])]})

for r in righe:
    print(r["foglio"], r["classe"], r["quota_dentro"], r["area_dentro_m2"])
fab = [r for r in sel if r["tipo"] == "FAB"]
print("righe:", len(sel), "FAB:", len(fab), "TER:", len(sel) - len(fab),
      "particelle FAB distinte:", len({(r["foglio"], r["particella"]) for r in fab}))
print("fogli dell'elenco nei Tamburi:", sorted({int(r["foglio"]) for r in sel}))
