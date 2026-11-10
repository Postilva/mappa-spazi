"""Scarica la mappa di base OpenStreetMap (tessere vettoriali OpenFreeMap, schema OpenMapTiles)
per Taranto, più i caratteri per le etichette.

La pagina claude.ai non può caricare tessere da server esterni (CSP): le tessere scaricate qui
vengono incorporate nella pagina da build_sito.py.

Cosa scarica:
  zoom 10–13: tutto il riquadro che contiene le particelle localizzate (più un margine);
  zoom 14:    solo le tessere dove c'è almeno una particella con locali di interesse (scripts/tipi.py),
              più la tessera accanto quando la particella è vicina al bordo. Altrove la mappa ingrandisce z13.

Uso: python3 scripts/scarica_base_osm.py   (dopo scripts/posizioni_citta.py)
Esito: sito/dati/osm/{z}/{x}/{y}.pbf, sito/dati/osm/fonts/<font>/<range>.pbf, sito/dati/osm/fonte.json

Dati © OpenStreetMap contributors (ODbL), tessere OpenFreeMap / OpenMapTiles.
"""
import csv, gzip, json, math, os, shutil, sys, urllib.request
from collections import defaultdict
sys.path.insert(0, os.path.dirname(__file__))
import tipi

QUI = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(QUI, "..")
OUT = os.path.join(R, "sito", "dati", "osm")
MARGINE = 0.015               # gradi oltre i punti
BORDO = 0.2                   # frazione di tessera: sotto, si scarica anche la tessera accanto
FONT = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"]
RANGE = ["0-255", "256-511", "8192-8447"]  # latino, latino esteso, punteggiatura (’ –)


def scarica(url):
    req = urllib.request.Request(url, headers={"User-Agent": "mappa-spazi/1.0", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=60) as r:
        dati = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or dati[:2] == b"\x1f\x8b":
            dati = gzip.decompress(dati)
        return dati


def frazione(lon, lat, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def punti():
    """(lon, lat, di_interesse) per ogni particella localizzata."""
    cat = defaultdict(list)
    for r in csv.DictReader(open(os.path.join(R, "dati/fonti/elenco-immobili-2024.csv"), encoding="utf-8")):
        if r["tipo"] == "FAB":
            cat[(r["foglio"], r["particella"])].append(r["categoria_codice"])
    out = []
    for r in csv.DictReader(open(os.path.join(R, "dati/citta/posizioni.csv"))):
        if r["lat"]:
            t, _, _ = tipi.classifica(cat[(r["foglio"], r["particella"])])
            out.append((float(r["lon"]), float(r["lat"]), any(t)))
    return out


def main():
    pp = punti()
    b = [min(p[0] for p in pp) - MARGINE, min(p[1] for p in pp) - MARGINE,
         max(p[0] for p in pp) + MARGINE, max(p[1] for p in pp) + MARGINE]
    voglio = set()
    for z in range(10, 14):
        x0, y1 = (int(v) for v in frazione(b[0], b[1], z))
        x1, y0 = (int(v) for v in frazione(b[2], b[3], z))
        voglio |= {(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
    for lon, lat, interesse in pp:
        if not interesse:
            continue
        fx, fy = frazione(lon, lat, 14)
        xs, ys = {int(fx)}, {int(fy)}
        if fx % 1 < BORDO: xs.add(int(fx) - 1)
        if fx % 1 > 1 - BORDO: xs.add(int(fx) + 1)
        if fy % 1 < BORDO: ys.add(int(fy) - 1)
        if fy % 1 > 1 - BORDO: ys.add(int(fy) + 1)
        voglio |= {(14, x, y) for x in xs for y in ys}
    tj = json.loads(scarica("https://tiles.openfreemap.org/planet"))
    modello = tj["tiles"][0]
    vecchia = None
    try:
        vecchia = json.load(open(os.path.join(OUT, "fonte.json")))["tessere"]
    except Exception:
        pass
    if vecchia != modello:   # nuova versione dei dati: si riparte da zero per non mescolare versioni
        for d in os.listdir(OUT) if os.path.isdir(OUT) else []:
            if d.isdigit():
                shutil.rmtree(os.path.join(OUT, d))
    n = peso = 0
    for z, x, y in sorted(voglio):
        f = os.path.join(OUT, str(z), str(x), f"{y}.pbf")
        if not os.path.exists(f):
            os.makedirs(os.path.dirname(f), exist_ok=True)
            open(f, "wb").write(scarica(modello.format(z=z, x=x, y=y)))
        n += 1
        peso += os.path.getsize(f)
    # tessere non più necessarie
    for z in os.listdir(OUT):
        if z.isdigit():
            for x in os.listdir(os.path.join(OUT, z)):
                for fy in os.listdir(os.path.join(OUT, z, x)):
                    if (int(z), int(x), int(fy[:-4])) not in voglio:
                        os.remove(os.path.join(OUT, z, x, fy))
    for f in FONT:
        for r in RANGE:
            p = os.path.join(OUT, "fonts", f, f"{r}.pbf")
            if not os.path.exists(p):
                os.makedirs(os.path.dirname(p), exist_ok=True)
                open(p, "wb").write(scarica(f"https://tiles.openfreemap.org/fonts/{urllib.request.quote(f)}/{r}.pbf"))
    json.dump({"tessere": modello, "zoom": [10, 14], "bbox": [round(v, 5) for v in b],
               "attribuzione": "© OpenStreetMap contributors (ODbL) · OpenFreeMap · OpenMapTiles"},
              open(os.path.join(OUT, "fonte.json"), "w"), indent=1)
    per_z = defaultdict(int)
    for z, _, _ in voglio:
        per_z[z] += 1
    print(f"{n} tessere ({dict(sorted(per_z.items()))}), {peso / 1024:.0f} KB")


if __name__ == "__main__":
    main()
