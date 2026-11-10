"""Scarica la mappa di base OpenStreetMap (tessere vettoriali OpenFreeMap, schema OpenMapTiles)
per la zona dei Tamburi, più i caratteri per le etichette.

La pagina claude.ai non può caricare tessere da server esterni (CSP): le tessere scaricate qui
vengono incorporate nella pagina da build_sito.py.

Uso: python3 scripts/scarica_base_osm.py
Esito: sito/dati/osm/{z}/{x}/{y}.pbf, sito/dati/osm/fonts/<font>/<range>.pbf, sito/dati/osm/fonte.json

Dati © OpenStreetMap contributors (ODbL), tessere OpenFreeMap / OpenMapTiles.
"""
import json
import math
import os
import urllib.request
import gzip

QUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(QUI, "..", "sito", "dati", "osm")
BASE = os.path.join(QUI, "..", "sito", "dati", "base.geojson")

ZOOM = range(10, 15)          # OpenFreeMap arriva a z14; oltre la mappa ingrandisce le tessere z14
MARGINE = 0.02                # gradi oltre la vista (come maxBounds nel sito)
FONT = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"]
RANGE = ["0-255", "256-511", "8192-8447"]  # latino, latino esteso, punteggiatura (’ –)


def scarica(url):
    req = urllib.request.Request(url, headers={"User-Agent": "mappa-spazi/1.0", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=60) as r:
        dati = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or dati[:2] == b"\x1f\x8b":
            dati = gzip.decompress(dati)
        return dati


def tessera(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def main():
    b = json.load(open(BASE))["bbox"]
    b = [b[0] - MARGINE, b[1] - MARGINE, b[2] + MARGINE, b[3] + MARGINE]
    tj = json.loads(scarica("https://tiles.openfreemap.org/planet"))
    modello = tj["tiles"][0]
    n = peso = 0
    for z in ZOOM:
        x0, y1 = tessera(b[0], b[1], z)
        x1, y0 = tessera(b[2], b[3], z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                d = scarica(modello.format(z=z, x=x, y=y))
                p = os.path.join(OUT, str(z), str(x))
                os.makedirs(p, exist_ok=True)
                open(os.path.join(p, f"{y}.pbf"), "wb").write(d)
                n += 1
                peso += len(d)
    for f in FONT:
        for r in RANGE:
            d = scarica(f"https://tiles.openfreemap.org/fonts/{urllib.request.quote(f)}/{r}.pbf")
            p = os.path.join(OUT, "fonts", f)
            os.makedirs(p, exist_ok=True)
            open(os.path.join(p, f"{r}.pbf"), "wb").write(d)
    json.dump({"tessere": modello, "zoom": [min(ZOOM), max(ZOOM)], "bbox": [round(v, 5) for v in b],
               "attribuzione": "© OpenStreetMap contributors (ODbL) · OpenFreeMap · OpenMapTiles"},
              open(os.path.join(OUT, "fonte.json"), "w"), indent=1)
    print(f"{n} tessere, {peso / 1024:.0f} KB; caratteri: {len(FONT)}×{len(RANGE)}")


if __name__ == "__main__":
    main()
