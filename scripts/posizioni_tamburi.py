#!/usr/bin/env python3
"""Passo 4 - Posizione di ogni particella FAB dei Tamburi dalla cartografia catastale.

Metodo:
 1. WFS CP:CadastralZoning su un riquadro ampio (40.45-40.52 N, 17.15-17.30 E) per trovare
    TUTTE le parti (mappa principale, allegati, sviluppi) dei fogli con fabbricati nell'elenco
    dei Tamburi, anche quelle lontane dal confine (es. allegati del foglio 319).
 2. WFS CP:CadastralParcel a tasselli (~0,004 gradi) sul riquadro di quelle parti; un tassello
    con piu' di 500 oggetti, o rifiutato dal servizio, viene diviso in quattro.
 3. Per ogni coppia foglio+particella FAB: unione dei poligoni con lo stesso foglio e numero
    di particella; posizione = baricentro (metodo `baricentro_poligono`) o, se il baricentro
    cade fuori dal poligono (forme a L, a C), un punto interno garantito (`punto_interno`).
 4. Controllo del punto contro il confine di lavoro: `dentro_tamburi` = si/no.
Output: dati/tamburi/posizioni.csv
Uso: python scripts/posizioni_tamburi.py   (shapely, pyproj: scripts/requirements.txt)
"""
import csv, json, os, sys, warnings
from collections import defaultdict
warnings.filterwarnings("ignore", category=DeprecationWarning)
from shapely.geometry import shape, Polygon, Point
from shapely.ops import unary_union, transform
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(__file__))
import catasto

R = os.path.join(os.path.dirname(__file__), "..")
P = lambda *a: os.path.join(R, *a)
utm = Transformer.from_crs("EPSG:4326", "EPSG:32633", always_xy=True).transform

confine = shape(json.load(open(P("dati/geo/tamburi-confine.geojson")))["features"][0]["geometry"])
righe = [r for r in csv.DictReader(open(P("dati/tamburi/elenco-tamburi.csv"))) if r["tipo"] == "FAB"]
coppie = sorted({(int(r["foglio"]), r["particella"]) for r in righe}, key=lambda c: (c[0], c[1].zfill(8)))
fogli = {f for f, _ in coppie}

# 1. parti dei fogli
zone, nm, nr = catasto.get_features("CP:CadastralZoning", (40.45, 17.15, 40.52, 17.30))
assert nm == nr, (nm, nr)
parti = [z for z in zone if (d := catasto.scomponi(z["ref"])) and d["comune"] == "L049" and d["foglio_n"] in fogli]
assert {catasto.scomponi(z["ref"])["foglio_n"] for z in parti} == fogli
ext = unary_union([Polygon(p[0]) for z in parti for p in z["poligoni"]]).bounds  # lon0, lat0, lon1, lat1
print("parti dei fogli:", len(parti), "riquadro:", [round(v, 5) for v in ext])

# 2. particelle a tasselli
geo = defaultdict(list)   # (foglio, particella) -> [(ref, Polygon)]
n_req, n_vuoti, n_divisi = [0], [0], [0]
def tassello(lat0, lon0, lat1, lon1, liv=0):
    n_req[0] += 1
    try:
        feats, nm, nr = catasto.get_features("CP:CadastralParcel", (lat0, lon0, lat1, lon1), tentativi=1)
    except IOError:
        # riquadro rifiutato ("Richiesta non valida"): si divide in quattro
        assert liv < 4, "riquadro rifiutato anche dopo 4 suddivisioni: %r" % ((lat0, lon0, lat1, lon1),)
        n_divisi[0] += 1
        la, lo = (lat0 + lat1) / 2, (lon0 + lon1) / 2
        for b in ((lat0, lon0, la, lo), (lat0, lo, la, lon1), (la, lon0, lat1, lo), (la, lo, lat1, lon1)):
            tassello(*b, liv + 1)
        return
    if nm == "unknown" and nr == "0":
        n_vuoti[0] += 1   # riquadro senza particelle (mare, aree non mappate): il servizio risponde cosi'
        return
    if nm != nr or int(nr) >= 500:
        assert liv < 4, "troppi livelli di suddivisione"
        la, lo = (lat0 + lat1) / 2, (lon0 + lon1) / 2
        for b in ((lat0, lon0, la, lo), (lat0, lo, la, lon1), (la, lon0, lat1, lo), (la, lo, lat1, lon1)):
            tassello(*b, liv + 1)
        return
    for f in feats:
        d = catasto.scomponi(f["ref"])
        if not d or d["comune"] != "L049" or d["foglio_n"] not in fogli or not d["particella"]:
            continue
        for rings in f["poligoni"]:
            geo[(d["foglio_n"], d["particella"])].append((f["ref"], Polygon(rings[0], rings[1:]).buffer(0)))
PASSO = 0.004
lat = ext[1]
while lat < ext[3]:
    lon = ext[0]
    while lon < ext[2]:
        tassello(lat, lon, min(lat + PASSO, ext[3]), min(lon + PASSO, ext[2]))
        lon += PASSO
    lat += PASSO
print("richieste particelle:", n_req[0], "di cui vuote:", n_vuoti[0], "riquadri rifiutati e divisi:", n_divisi[0])

# 3-4. posizioni
out = []
for f, p in coppie:
    parts = geo.get((f, p), [])
    row = {"foglio": f, "particella": p, "lat": "", "lon": "", "metodo": "da_localizzare",
           "n_poligoni": 0, "area_m2": "", "mappe_inspire": "", "dentro_tamburi": ""}
    if parts:
        # lo stesso poligono puo' arrivare da due tasselli: deduplica per geometria
        uniq = {}
        for ref, g in parts:
            uniq[(ref, g.wkb)] = g
        g = unary_union(list(uniq.values()))
        c = g.centroid
        metodo = "baricentro_poligono"
        if not g.contains(c):
            c, metodo = g.representative_point(), "punto_interno"
        row.update(lat=round(c.y, 7), lon=round(c.x, 7), metodo=metodo,
                   n_poligoni=len(getattr(g, "geoms", [g])), area_m2=round(transform(utm, g).area),
                   mappe_inspire=" ".join(sorted({r.split(".")[0] for r, _ in uniq})),
                   dentro_tamburi="si" if confine.contains(c) else "no")
    out.append(row)
with open(P("dati/tamburi/posizioni.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(out[0]))
    w.writeheader(); w.writerows(out)
loc = [r for r in out if r["lat"] != ""]
print("particelle FAB:", len(out), "localizzate:", len(loc), "da localizzare:", len(out) - len(loc),
      "dentro:", sum(r["dentro_tamburi"] == "si" for r in loc), "fuori:", sum(r["dentro_tamburi"] == "no" for r in loc),
      "punto_interno:", sum(r["metodo"] == "punto_interno" for r in loc))
