#!/usr/bin/env python3
"""Passo 4 - Controllo indipendente delle posizioni con il WMS (GetFeatureInfo).

Per un campione di particelle localizzate (default 6, scelte con seme fisso tra fogli
diversi) interroga il WMS INSPIRE dell'Agenzia delle Entrate al punto calcolato e
controlla che restituisca la stessa particella (foglio + numero).

Il WMS risponde «ERRX-2» se le richieste sono troppo ravvicinate: una richiesta ogni
PAUSA secondi, attese crescenti in caso di errore. Output: dati/tamburi/verifica-posizioni.csv
Uso: python scripts/verifica_posizioni.py [n]   (pyproj: scripts/requirements.txt)
"""
import csv, os, random, re, sys, time, urllib.parse, urllib.request
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(__file__))
import catasto

WMS = "https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php"
PAUSA = 75
R = os.path.join(os.path.dirname(__file__), "..")
P = lambda *a: os.path.join(R, *a)
t = Transformer.from_crs("EPSG:4326", "EPSG:25833", always_xy=True).transform

def gfi(lat, lon):
    x, y = t(lon, lat)
    q = {"language": "ita", "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetFeatureInfo",
         "BBOX": "%.2f,%.2f,%.2f,%.2f" % (x - 25, y - 25, x + 25, y + 25), "CRS": "EPSG:25833",
         "WIDTH": 101, "HEIGHT": 101, "LAYERS": "CP.CadastralParcel", "STYLES": "", "FORMAT": "image/png",
         "QUERY_LAYERS": "CP.CadastralParcel", "INFO_FORMAT": "text/html", "I": 50, "J": 50}
    url = WMS + "?" + urllib.parse.urlencode(q, safe=":,/")
    for attesa in (0, 120, 240, 480):
        time.sleep(attesa)
        try:
            html = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": catasto.UA}), timeout=60).read().decode("latin1")
        except OSError as e:  # connessione interrotta: si riprova dopo l'attesa
            print("  errore di rete:", e, file=sys.stderr, flush=True)
            continue
        if "ERRX" not in html:
            m = re.search(r"NationalCadastralReference</th><td>([^<]+)<", html)
            return m.group(1).strip() if m else ""
    return None

n = int(sys.argv[1]) if len(sys.argv) > 1 else 6
pos = [r for r in csv.DictReader(open(P("dati/tamburi/posizioni.csv"))) if r["lat"]]
random.seed(20261110)
per_foglio = {}
for r in random.sample(pos, len(pos)):
    per_foglio.setdefault(r["foglio"], []).append(r)
campione, i = [], 0
while len(campione) < min(n, len(pos)):
    for f in sorted(per_foglio):
        if i < len(per_foglio[f]) and len(campione) < n:
            campione.append(per_foglio[f][i])
    i += 1
# ripresa: i campioni gia' verificati in un'esecuzione precedente non si richiedono di nuovo
OUT = P("dati/tamburi/verifica-posizioni.csv")
fatti = {}
if os.path.exists(OUT):
    fatti = {(o["foglio"], o["particella"]): o for o in csv.DictReader(open(OUT)) if o["esito"] != "non_verificato"}
out, prima = [], True
for r in campione:
    if (r["foglio"], r["particella"]) in fatti:
        out.append(fatti[(r["foglio"], r["particella"])])
        continue
    if not prima:
        time.sleep(PAUSA)
    prima = False
    ref = gfi(float(r["lat"]), float(r["lon"]))
    d = catasto.scomponi(ref) if ref else None
    ok = bool(d) and d["foglio_n"] == int(r["foglio"]) and d["particella"] == r["particella"]
    out.append({"foglio": r["foglio"], "particella": r["particella"], "lat": r["lat"], "lon": r["lon"],
                "risposta_wms": ref if ref is not None else "ERRX-2 (nessuna risposta)", "esito": "non_verificato" if ref is None else ("ok" if ok else "diverso")})
    print(out[-1], flush=True)
with open(OUT, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
print("ok:", sum(o["esito"] == "ok" for o in out), "/", len(out))
