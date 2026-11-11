#!/usr/bin/env python3
"""Posizione di tutte le particelle FAB dell'elenco 2024 (tutta Taranto) dalla cartografia catastale.

Stesso metodo di posizioni_tamburi.py (passo 4), esteso a tutti i fogli con fabbricati nell'elenco:
 1. WFS CP:CadastralZoning a riquadri su tutto il territorio comunale, per trovare le parti dei fogli.
 2. WFS CP:CadastralParcel a tasselli (griglia fissa di 0,004 gradi) solo dove passa una parte di
    foglio che ci serve; tassello pieno o rifiutato = diviso in quattro. Le risposte già in cache
    (compresi i tasselli dei Tamburi) non vengono richieste di nuovo.
 3. Posizione = baricentro del poligono, o punto interno se il baricentro cade fuori.
Output: dati/citta/posizioni.csv (una riga per particella FAB), dati/citta/poligoni.geojson
Uso: python3 scripts/posizioni_citta.py     (lento: 10 s di pausa tra le richieste; si può interrompere e rilanciare)
"""
import csv, json, os, sys, warnings
from collections import defaultdict
warnings.filterwarnings("ignore", category=DeprecationWarning)
from shapely.geometry import Polygon, box, mapping
from shapely.ops import unary_union, transform
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(__file__))
import catasto

R = os.path.join(os.path.dirname(__file__), "..")
P = lambda *a: os.path.join(R, *a)
utm = Transformer.from_crs("EPSG:4326", "EPSG:32633", always_xy=True).transform
COMUNE = (40.30, 17.00, 40.60, 17.45)   # riquadro largo attorno al Comune di Taranto (lat0, lon0, lat1, lon1)
PASSO = 0.004

righe = [r for r in csv.DictReader(open(P("dati/fonti/elenco-immobili-2024.csv"), encoding="utf-8")) if r["tipo"] == "FAB"]
coppie = sorted({(int(r["foglio"]), r["particella"]) for r in righe}, key=lambda c: (c[0], c[1].zfill(8)))
fogli = {f for f, _ in coppie}
log = lambda *a: print(*a, flush=True)


def dividi(b):
    lat0, lon0, lat1, lon1 = b
    la, lo = (lat0 + lat1) / 2, (lon0 + lon1) / 2
    return ((lat0, lon0, la, lo), (lat0, lo, la, lon1), (la, lon0, lat1, lo), (la, lo, lat1, lon1))


def scarica(tipo, b, liv=0, maxliv=3):
    """Tutte le feature nel riquadro, dividendo quando il servizio rifiuta o tronca."""
    try:
        feats, nm, nr = catasto.get_features(tipo, b, tentativi=0)
    except IOError:
        log("  rifiutato (liv %d)" % liv, b)
        if liv >= maxliv:
            log("  RINUNCIA riquadro", b)
            return []
        return [f for q in dividi(b) for f in scarica(tipo, q, liv + 1, maxliv)]
    if nm == "unknown" and nr == "0":
        return []
    if nm != nr or int(nr) >= 500:
        if liv >= maxliv:
            log("  TRONCATO riquadro", b)
            return feats
        return [f for q in dividi(b) for f in scarica(tipo, q, liv + 1, maxliv)]
    return feats


# 1. parti dei fogli
zone = {}
# riquadri di 0,07 x 0,15 gradi (come quello già usato per i Tamburi); uno rifiutato si salta (mare o fuori Comune)
RIQUADRI = [(la, lo, round(la + 0.07, 2), round(lo + 0.15, 2)) for la in (40.31, 40.38, 40.45, 40.52) for lo in (17.00, 17.15, 17.30)]
for z in (f for q in RIQUADRI for f in scarica("CP:CadastralZoning", q, maxliv=1)):
    d = catasto.scomponi(z["ref"])
    if d and d["comune"] == "L049" and d["foglio_n"] in fogli:
        zone[z["ref"]] = unary_union([Polygon(p[0]).buffer(0) for p in z["poligoni"]])
trovati = {catasto.scomponi(r)["foglio_n"] for r in zone}
log("fogli nell'elenco:", len(fogli), "trovati nella cartografia:", len(trovati), "mancanti:", sorted(fogli - trovati))
area = unary_union(list(zone.values()))

# 2. particelle: tasselli della griglia che toccano le parti dei fogli
geo = defaultdict(dict)   # (foglio, particella) -> {(ref, wkb): Polygon}
def raccogli(feats):
    for f in feats:
        d = catasto.scomponi(f["ref"])
        if not d or d["comune"] != "L049" or d["foglio_n"] not in fogli or not d["particella"]:
            continue
        for rings in f["poligoni"]:
            g = Polygon(rings[0], rings[1:]).buffer(0)
            geo[(d["foglio_n"], d["particella"])][(f["ref"], g.wkb)] = g

# 2a. tasselli già scaricati per i Tamburi (stessa sequenza di posizioni_tamburi.py: tutto in cache)
vecchio = None
try:
    tr = [r for r in csv.DictReader(open(P("dati/tamburi/elenco-tamburi.csv"))) if r["tipo"] == "FAB"]
    ft = {int(r["foglio"]) for r in tr}
    zt, _, _ = catasto.get_features("CP:CadastralZoning", (40.45, 17.15, 40.52, 17.30))
    pt = [z for z in zt if (d := catasto.scomponi(z["ref"])) and d["comune"] == "L049" and d["foglio_n"] in ft]
    ext = unary_union([Polygon(p[0]) for z in pt for p in z["poligoni"]]).bounds
    lat = ext[1]
    while lat < ext[3]:
        lon = ext[0]
        while lon < ext[2]:
            raccogli(scarica("CP:CadastralParcel", (lat, lon, min(lat + PASSO, ext[3]), min(lon + PASSO, ext[2])), maxliv=4))
            lon += PASSO
        lat += PASSO
    vecchio = box(ext[0], ext[1], ext[2], ext[3])
    log("tasselli dei Tamburi ripresi; particelle finora:", len(geo))
except Exception as e:
    log("tasselli dei Tamburi non ripresi:", e)

# 2b. il resto
x0, y0, x1, y1 = area.bounds
i0, i1 = int((y0 - COMUNE[0]) / PASSO), int((y1 - COMUNE[0]) / PASSO) + 1
j0, j1 = int((x0 - COMUNE[1]) / PASSO), int((x1 - COMUNE[1]) / PASSO) + 1
tasselli = []
for i in range(i0, i1):
    for j in range(j0, j1):
        la, lo = COMUNE[0] + i * PASSO, COMUNE[1] + j * PASSO
        q = box(lo, la, lo + PASSO, la + PASSO)
        if not q.intersects(area) or (vecchio is not None and vecchio.contains(q)):
            continue
        tasselli.append((round(la, 6), round(lo, 6), round(la + PASSO, 6), round(lo + PASSO, 6)))
log("tasselli da leggere:", len(tasselli))
for n, b in enumerate(tasselli):
    raccogli(scarica("CP:CadastralParcel", b, maxliv=2))
    if n % 5 == 0:
        log(f"  {n}/{len(tasselli)} · particelle dell'elenco trovate: {sum(1 for c in coppie if c in geo)}/{len(coppie)}")

# 3. posizioni
out, feats = [], []
for f, p in coppie:
    parts = geo.get((f, p), {})
    row = {"foglio": f, "particella": p, "lat": "", "lon": "", "metodo": "da_localizzare",
           "n_poligoni": 0, "area_m2": "", "mappe_inspire": ""}
    if parts:
        g = unary_union(list(parts.values()))
        c = g.centroid
        metodo = "baricentro_poligono"
        if not g.contains(c):
            c, metodo = g.representative_point(), "punto_interno"
        row.update(lat=round(c.y, 7), lon=round(c.x, 7), metodo=metodo,
                   n_poligoni=len(getattr(g, "geoms", [g])), area_m2=round(transform(utm, g).area),
                   mappe_inspire=" ".join(sorted({r.split(".")[0] for r, _ in parts})))
        gs = g.simplify(0.000006, preserve_topology=True)
        feats.append({"type": "Feature", "properties": {"id": f"{f}-{p}"}, "geometry": mapping(gs)})
    out.append(row)
os.makedirs(P("dati/citta"), exist_ok=True)
with open(P("dati/citta/posizioni.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(out[0]))
    w.writeheader(); w.writerows(out)
json.dump({"type": "FeatureCollection", "features": feats}, open(P("dati/citta/poligoni.geojson"), "w"), separators=(",", ":"))
loc = [r for r in out if r["lat"] != ""]
log("particelle FAB:", len(out), "localizzate:", len(loc), "da localizzare:", len(out) - len(loc))
