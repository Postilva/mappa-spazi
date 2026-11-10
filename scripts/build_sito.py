"""Genera il sito di prova della mappa degli spazi pubblici dei Tamburi.

Uso (dalla radice del repository):
    python3 scripts/build_sito.py [--istat <cartella SHP di R16_21 estratta>]

Legge:
  dati/edifici/*.json                 schede degli edifici (passo 5)
  dati/tamburi/posizioni.csv          area della particella sulla mappa (passo 4)
  dati/geo/tamburi-confine.geojson    confine di lavoro (passo 3)
  .cache/catasto/*.xml                risposte WFS dell'Agenzia delle Entrate (passo 4, non versionate)
  <istat>/R16_21_WGS84.shp            sezioni ISTAT 2021 (facoltativo, per la terraferma)
  sito/src/                           template HTML, CSS, JS

Scrive:
  sito/dati/edifici.geojson           punti degli edifici con i campi della scheda
  sito/dati/base.geojson              mappa di base vettoriale (terra, particelle, confine, edifici)
  sito/index.html, sito/assets/       versione normale (documento completo, dati letti con fetch)
  sito/dist/pagina-claude.html        file unico per la pagina privata claude.ai (frammento)

Se la cache WFS o le sezioni ISTAT non sono disponibili, i livelli corrispondenti vengono
ripresi dal sito/dati/base.geojson già generato (che è versionato).
Serve shapely (e pyshp se si passa --istat): vedi scripts/requirements.txt.
"""
import argparse, csv, glob, json, os, sys, warnings
import xml.etree.ElementTree as ET

from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union

warnings.filterwarnings("ignore", category=DeprecationWarning)

RADICE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SITO = os.path.join(RADICE, "sito")
SRC = os.path.join(SITO, "src")
MAPLIBRE = "4.7.1"
MAPLIBRE_JS = f"https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/{MAPLIBRE}/maplibre-gl.js"
MAPLIBRE_CSS = f"https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/{MAPLIBRE}/maplibre-gl.css"
FONT = "https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap"
GML = "{http://www.opengis.net/gml/3.2}"
CP = "{http://mapserver.gis.umn.edu/mapserver}"
MARGINE = 0.004  # gradi attorno al confine per la mappa di base
TOLL = 0.000006  # semplificazione (~0,5 m)
DEC = 6          # decimali delle coordinate (~0,1 m)

# Tipo di bene: categoria catastale raggruppata (spiegato nella pagina Metodo)
GRUPPI = {"A": "abitazioni", "B": "scuole_servizi", "E": "scuole_servizi", "C": "negozi_depositi"}


def gruppo(cat):
    return GRUPPI.get((cat or "?")[0], "altro")


def arrotonda(geom):
    def r(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], DEC), round(c[1], DEC)]
        return [r(x) for x in c]
    g = mapping(geom)
    return {"type": g["type"], "coordinates": r(g["coordinates"])}


def edifici():
    aree = {}
    with open(os.path.join(RADICE, "dati/tamburi/posizioni.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            aree[(r["foglio"], r["particella"])] = r["area_m2"]
    out = []
    for fn in sorted(glob.glob(os.path.join(RADICE, "dati/edifici/*.json"))):
        if os.path.basename(fn).startswith("_"):
            continue
        d = json.load(open(fn, encoding="utf-8"))
        if d.get("lat") is None or d.get("lon") is None:
            continue
        p = {k: v for k, v in d.items() if k not in ("lat", "lon")}
        p["tipo_bene"] = gruppo(d.get("categoria_catastale"))
        p["n_unita"] = len(d.get("unita", []))
        a = aree.get((d["foglio"], d["particella"]))
        p["area_particella_m2"] = int(a) if a else None
        p["lat"], p["lon"] = d["lat"], d["lon"]
        out.append({"type": "Feature", "id": d["id"], "properties": p,
                    "geometry": {"type": "Point", "coordinates": [d["lon"], d["lat"]]}})
    out.sort(key=lambda f: (int(f["properties"]["foglio"]), int(f["properties"]["particella"])))
    return out


def particelle_wfs():
    """Tutti i poligoni CP:CadastralParcel presenti nella cache WFS, per riferimento INSPIRE."""
    pol = {}
    for fn in glob.glob(os.path.join(RADICE, ".cache/catasto/*.xml")):
        try:
            root = ET.parse(fn).getroot()
        except ET.ParseError:
            continue
        for el in root.iter(CP + "CadastralParcel"):
            ref = el.findtext(CP + "NATIONALCADASTRALREFERENCE")
            if not ref or ref in pol:
                continue
            polys = []
            for p in el.iter(GML + "Polygon"):
                rings = []
                for ring in p.iter(GML + "posList"):
                    v = [float(x) for x in ring.text.split()]
                    rings.append([(v[i + 1], v[i]) for i in range(0, len(v), 2)])
                if rings and len(rings[0]) >= 4:
                    from shapely.geometry import Polygon
                    polys.append(Polygon(rings[0], rings[1:]))
            if polys:
                pol[ref] = unary_union(polys)
    return pol


def chiave(ref):
    # L049A0201A0.129 -> ("201", "129")
    try:
        mappa, part = ref.split(".", 1)
        return str(int(mappa[5:9])), part
    except (ValueError, IndexError):
        return None


def terra_istat(cartella, vista):
    import shapefile
    from pyproj import Transformer
    from shapely.ops import transform
    tr = Transformer.from_crs("EPSG:32632", "EPSG:4326", always_xy=True).transform
    inv = Transformer.from_crs("EPSG:4326", "EPSG:32632", always_xy=True).transform
    vista_utm = transform(inv, vista)
    r = shapefile.Reader(os.path.join(cartella, "R16_21_WGS84"))
    geoms = []
    for i, s in enumerate(r.iterShapes()):
        x0, y0, x1, y1 = s.bbox
        if x1 < vista_utm.bounds[0] or x0 > vista_utm.bounds[2] or y1 < vista_utm.bounds[1] or y0 > vista_utm.bounds[3]:
            continue
        g = shape(s.__geo_interface__)
        if g.intersects(vista_utm):
            geoms.append(g.buffer(0))
    terra = unary_union(geoms).buffer(1).buffer(-1)  # chiude le fessure tra sezioni
    return transform(tr, terra).intersection(vista).simplify(TOLL * 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--istat", help="cartella con R16_21_WGS84.shp (sezioni ISTAT 2021)")
    a = ap.parse_args()

    feats = edifici()
    ids = {(f["properties"]["foglio"], f["properties"]["particella"]) for f in feats}
    confine = shape(json.load(open(os.path.join(RADICE, "dati/geo/tamburi-confine.geojson")))["features"][0]["geometry"])
    x0, y0, x1, y1 = confine.bounds
    vista = box(x0 - MARGINE, y0 - MARGINE, x1 + MARGINE, y1 + MARGINE)

    precedente = {}
    fb = os.path.join(SITO, "dati/base.geojson")
    if os.path.exists(fb):
        for f in json.load(open(fb))["features"]:
            precedente.setdefault(f["properties"]["livello"], []).append(f)

    base = []
    # terraferma (ISTAT)
    if a.istat:
        t = terra_istat(a.istat, vista)
        base.append({"type": "Feature", "properties": {"livello": "terra"}, "geometry": arrotonda(t)})
        print("terra: da ISTAT")
    else:
        base += precedente.get("terra", [])
        print("terra: ripresa da base.geojson" if "terra" in precedente else "terra: assente (sfondo = terra)")

    # particelle catastali (WFS)
    pol = particelle_wfs()
    if pol:
        n = 0
        evidenziate = {}
        sfondo = []
        for ref, g in pol.items():
            k = chiave(ref)
            if k in ids:
                evidenziate.setdefault(k, []).append(g)
            if not g.intersects(vista):
                continue
            sfondo.append(g.intersection(vista).simplify(TOLL, preserve_topology=True))
        # le particelle di sfondo in un solo MultiPolygon (molto più leggero)
        fondo = unary_union([g for g in sfondo if not g.is_empty])
        base.append({"type": "Feature", "properties": {"livello": "particelle"}, "geometry": arrotonda(fondo)})
        for k, gs in sorted(evidenziate.items()):
            g = unary_union(gs).simplify(TOLL, preserve_topology=True)
            base.append({"type": "Feature", "properties": {"livello": "edificio", "id": f"{k[0]}-{k[1]}"},
                         "geometry": arrotonda(g)})
            n += 1
        print(f"particelle WFS: {len(pol)} in cache, {len(sfondo)} nella vista, {n} degli edifici")
        mancano = ids - set(evidenziate)
        if mancano:
            print("ATTENZIONE: particelle senza poligono:", sorted(mancano), file=sys.stderr)
    else:
        base += precedente.get("particelle", []) + precedente.get("edificio", [])
        print("particelle: riprese da base.geojson (cache WFS assente)")

    # confine del quartiere e maschera dell'area fuori confine (resa più chiara sulla mappa)
    base.append({"type": "Feature", "properties": {"livello": "fuori"},
                 "geometry": arrotonda(vista.buffer(0.01, join_style=2).difference(confine).simplify(TOLL * 2))})
    base.append({"type": "Feature", "properties": {"livello": "confine"}, "geometry": arrotonda(confine.simplify(TOLL * 2))})

    os.makedirs(os.path.join(SITO, "dati"), exist_ok=True)
    gj_edifici = {"type": "FeatureCollection", "features": feats}
    gj_base = {"type": "FeatureCollection", "bbox": [round(v, 5) for v in vista.bounds], "features": base}
    s_ed = json.dumps(gj_edifici, ensure_ascii=False, separators=(",", ":"))
    s_base = json.dumps(gj_base, ensure_ascii=False, separators=(",", ":"))
    open(os.path.join(SITO, "dati/edifici.geojson"), "w", encoding="utf-8").write(s_ed)
    open(fb, "w", encoding="utf-8").write(s_base)

    # --- assemblaggio pagine ---
    leggi = lambda n: open(os.path.join(SRC, n), encoding="utf-8").read()
    corpo = leggi("corpo.html")
    css = leggi("app.css")
    js = leggi("app.js")
    css_ml = leggi(f"vendor/maplibre-gl-{MAPLIBRE}.css")
    meta = {"generato": feats[0]["properties"].get("ultima_modifica") if feats else "", "maplibre": MAPLIBRE}

    testa = (f'<title>Spazi pubblici dei Tamburi</title>\n'
             f'<meta name="claude:viewport-fit-sides" content="cover">\n'
             f'<meta name="description" content="Mappa di prova degli immobili del Comune di Taranto nel quartiere Tamburi (elenco beni immobili 2024). Dati da verificare.">\n'
             f'<link rel="preconnect" href="https://fonts.googleapis.com">\n'
             f'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
             f'<link rel="stylesheet" href="{FONT}">\n')

    # 1) file unico per claude.ai (frammento, tutto incorporato)
    dati_js = ("window.MAPPA_DATI=" + json.dumps({"edifici": gj_edifici, "base": gj_base, "meta": meta},
                                                  ensure_ascii=False, separators=(",", ":")) + ";")
    dati_js = dati_js.replace("</", "<\\/")
    pagina = (testa + f'<script src="{MAPLIBRE_JS}"></script>\n'
              f"<style>\n{css_ml}\n{css}\n</style>\n{corpo}\n<script>\n{dati_js}\n</script>\n<script>\n{js}\n</script>\n")
    os.makedirs(os.path.join(SITO, "dist"), exist_ok=True)
    open(os.path.join(SITO, "dist/pagina-claude.html"), "w", encoding="utf-8").write(pagina)

    # 2) versione normale (documento completo, file collegati)
    os.makedirs(os.path.join(SITO, "assets"), exist_ok=True)
    open(os.path.join(SITO, "assets/app.css"), "w", encoding="utf-8").write(css)
    open(os.path.join(SITO, "assets/app.js"), "w", encoding="utf-8").write(js)
    indice = ('<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
              '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
              + testa +
              f'<link rel="stylesheet" href="{MAPLIBRE_CSS}">\n<link rel="stylesheet" href="assets/app.css">\n'
              f'<script src="{MAPLIBRE_JS}"></script>\n</head>\n<body>\n{corpo}\n'
              f'<script>window.MAPPA_DATI_URL={{"edifici":"dati/edifici.geojson","base":"dati/base.geojson","meta":{json.dumps(meta)}}};</script>\n'
              '<script src="assets/app.js"></script>\n</body>\n</html>\n')
    open(os.path.join(SITO, "index.html"), "w", encoding="utf-8").write(indice)

    kb = lambda s: len(s.encode("utf-8")) / 1024
    print(f"edifici: {len(feats)} · edifici.geojson {kb(s_ed):.0f} KB · base.geojson {kb(s_base):.0f} KB · "
          f"pagina-claude.html {kb(pagina):.0f} KB")


if __name__ == "__main__":
    main()
