"""Genera il sito di prova «Spazi pubblici di Taranto».

Uso (dalla radice del repository):
    python3 scripts/build_sito.py

Legge:
  dati/edifici/*.json            schede (scripts/genera_schede_citta.py)
  dati/citta/posizioni.csv       area della particella sulla mappa catastale
  dati/citta/poligoni.geojson    poligoni delle particelle (Agenzia delle Entrate, CC BY 4.0)
  sito/dati/osm/                 base OpenStreetMap (scripts/scarica_base_osm.py)
  sito/src/                      template HTML, CSS, JS

Scrive:
  sito/dati/edifici.geojson      punti degli immobili sulla mappa pubblica, con i campi della scheda
  sito/dati/base.geojson         poligoni delle particelle in mappa
  sito/index.html, sito/assets/  versione normale (documento completo, dati letti con fetch)
  sito/dist/pagina-claude.html   file unico per la pagina claude.ai (frammento, tutto incorporato)

Cosa va sulla mappa pubblica: solo le particelle con almeno un «locale di interesse» secondo
scripts/tipi.py (niente abitazioni né pertinenze). Delle unità escluse si pubblica solo il numero.
"""
import base64, csv, glob, gzip, json, os, sys
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
import tipi

RADICE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SITO = os.path.join(RADICE, "sito")
SRC = os.path.join(SITO, "src")
MAPLIBRE = "4.7.1"
MAPLIBRE_JS = f"https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/{MAPLIBRE}/maplibre-gl.js"
MAPLIBRE_CSS = f"https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/{MAPLIBRE}/maplibre-gl.css"
FONT = "https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap"
TITOLO = "Spazi pubblici di Taranto"
DEC = 6  # decimali delle coordinate (~0,1 m)


def arrotonda(c):
    if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
        return [round(c[0], DEC), round(c[1], DEC)]
    return [arrotonda(x) for x in c]


def edifici():
    """(feature pubbliche, statistiche sull'intero elenco localizzato)."""
    aree = {}
    with open(os.path.join(RADICE, "dati/citta/posizioni.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            aree[(r["foglio"], r["particella"])] = r["area_m2"]
    out, fonti, st = [], [], Counter()
    for fn in sorted(glob.glob(os.path.join(RADICE, "dati/edifici/*.json"))):
        if os.path.basename(fn).startswith("_"):
            continue
        d = json.load(open(fn, encoding="utf-8"))
        if d.get("lat") is None or d.get("lon") is None:
            continue
        st["schede"] += 1
        us = d.get("unita", [])
        tt, n_ab, n_pert = tipi.classifica([u["categoria"] for u in us])
        st["abitazioni"] += n_ab
        if not any(tt):
            st["solo_abitazioni"] += 1
            continue
        locali = [dict(u, tipo=t) for u, t in zip(us, tt) if t]
        conta = Counter(l["tipo"] for l in locali)
        ordine = [k for k, _ in tipi.TIPI]
        tipi_p = sorted(conta, key=lambda k: (-conta[k], ordine.index(k)))
        st["locali"] += len(locali)
        p = {k: v for k, v in d.items() if k not in ("lat", "lon", "unita", "fonti", "descrizione", "categoria_catastale")}
        # le fonti uguali per tutte le schede si scrivono una volta sola (meta.fonti)
        if d.get("fonti") not in fonti:
            fonti.append(d.get("fonti"))
        p["fonti_rif"] = fonti.index(d.get("fonti"))
        p.update(locali=locali, n_locali=len(locali), tipi=tipi_p, tipo_bene=tipi_p[0],
                 n_abitazioni=n_ab, n_pertinenze=n_pert, lat=d["lat"], lon=d["lon"])
        a = aree.get((d["foglio"], d["particella"]))
        p["area_particella_m2"] = int(a) if a else None
        out.append({"type": "Feature", "id": d["id"], "properties": p,
                    "geometry": {"type": "Point", "coordinates": [d["lon"], d["lat"]]}})
    def chiave(f):
        p = f["properties"]
        return ((p.get("zona") or {}).get("nome") or "￿", (p.get("via_vicina") or {}).get("nome") or "￿",
                int(p["foglio"]), p["particella"].zfill(8))
    out.sort(key=chiave)
    return out, fonti, st


def ricerca_online(feats):
    """Unisce alle schede quello che si è trovato online prima dei sopralluoghi (dati/ricerca/*.json).
    automatico.json (OpenStreetMap, anagrafe scuole) per primo; poi gli altri file in ordine di nome:
    nome_probabile, indicazione e certezza li decide l'ultimo che li indica; le note si sommano."""
    cart = os.path.join(RADICE, "dati/ricerca")
    nomi = sorted(glob.glob(os.path.join(cart, "*.json")), key=lambda f: (os.path.basename(f) != "automatico.json", f))
    tutto = {}
    for fn in nomi:
        for pid, v in json.load(open(fn, encoding="utf-8")).items():
            t = tutto.setdefault(pid, {"note": []})
            for k in ("nome_probabile", "indicazione", "certezza"):
                if v.get(k):
                    t[k] = v[k]
            t["note"] = [n for n in v.get("note", []) if n.get("testo")] + t["note"]
    for f in feats:
        o = tutto.get(f["properties"]["id"])
        if o:
            f["properties"]["online"] = o
    return Counter(o.get("indicazione", "solo_osm") for pid, o in tutto.items() if any(pid == f["properties"]["id"] for f in feats))


def osm_incorporato():
    """Tessere (compresse gzip) e caratteri OSM in base64, per la pagina unica."""
    cart = os.path.join(SITO, "dati/osm")
    if not os.path.exists(os.path.join(cart, "fonte.json")):
        print("ATTENZIONE: base OSM assente, lanciare scripts/scarica_base_osm.py", file=sys.stderr)
        return None
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    tessere, fonts = {}, {}
    for fn in glob.glob(os.path.join(cart, "*/*/*.pbf")):
        z, x, y = os.path.relpath(fn, cart)[:-4].split(os.sep)
        if z.isdigit():
            tessere[f"{z}/{x}/{y}"] = b64(gzip.compress(open(fn, "rb").read(), 9, mtime=0))
    for fn in glob.glob(os.path.join(cart, "fonts/*/*.pbf")):
        f, r = os.path.relpath(fn, os.path.join(cart, "fonts"))[:-4].split(os.sep)
        fonts[f"{f}/{r}"] = b64(gzip.compress(open(fn, "rb").read(), 9, mtime=0))
    fonte = json.load(open(os.path.join(cart, "fonte.json")))
    return {"tessere": tessere, "fonts": fonts, "gzip": True, "zoom": fonte["zoom"], "bbox": fonte["bbox"],
            "attribuzione": fonte["attribuzione"]}


def main():
    feats, fonti, st = edifici()
    per_indicazione = ricerca_online(feats)
    ids = {f["properties"]["id"] for f in feats}
    pol = json.load(open(os.path.join(RADICE, "dati/citta/poligoni.geojson")))["features"]
    base = [{"type": "Feature", "properties": {"livello": "edificio", "id": f["properties"]["id"]},
             "geometry": {"type": f["geometry"]["type"], "coordinates": arrotonda(f["geometry"]["coordinates"])}}
            for f in pol if f["properties"]["id"] in ids]
    xs = [f["geometry"]["coordinates"][0] for f in feats]
    ys = [f["geometry"]["coordinates"][1] for f in feats]
    bbox = [round(min(xs), 5), round(min(ys), 5), round(max(xs), 5), round(max(ys), 5)]

    # numeri per le pagine (calcolati, mai scritti a mano)
    da_loc = sum(1 for _ in csv.DictReader(open(os.path.join(RADICE, "dati/citta/da-localizzare.csv"))))
    per_tipo = Counter(l["tipo"] for f in feats for l in f["properties"]["locali"])
    numeri = {
        "particelle_elenco": st["schede"] + da_loc, "localizzate": st["schede"], "da_localizzare": da_loc,
        "in_mappa": len(feats), "locali": st["locali"], "solo_abitazioni": st["solo_abitazioni"],
        "con_via": sum(1 for f in feats if f["properties"].get("via_vicina")),
        "verificati": sum(1 for f in feats if f["properties"].get("data_sopralluogo")),
        "per_tipo": {k: per_tipo.get(k, 0) for k, _ in tipi.TIPI},
        "cercati_online": sum(1 for f in feats if f["properties"].get("online")),
        "per_indicazione": dict(per_indicazione),
    }

    os.makedirs(os.path.join(SITO, "dati"), exist_ok=True)
    gj_edifici = {"type": "FeatureCollection", "features": feats}
    gj_base = {"type": "FeatureCollection", "bbox": bbox, "features": base}
    s_ed = json.dumps(gj_edifici, ensure_ascii=False, separators=(",", ":"))
    s_base = json.dumps(gj_base, ensure_ascii=False, separators=(",", ":"))
    open(os.path.join(SITO, "dati/edifici.geojson"), "w", encoding="utf-8").write(s_ed)
    open(os.path.join(SITO, "dati/base.geojson"), "w", encoding="utf-8").write(s_base)

    # --- assemblaggio pagine ---
    leggi = lambda n: open(os.path.join(SRC, n), encoding="utf-8").read()
    corpo, css, js = leggi("corpo.html"), leggi("app.css"), leggi("app.js")
    css_ml = leggi(f"vendor/maplibre-gl-{MAPLIBRE}.css")
    generato = max((f["properties"].get("ultima_modifica") or "" for f in feats), default="")
    osm = osm_incorporato()
    meta = {"generato": generato, "maplibre": MAPLIBRE, "titolo": TITOLO, "tipi": tipi.TIPI, "numeri": numeri, "fonti": fonti}
    if osm:
        meta["osm"] = {"zoom": osm["zoom"], "bbox": osm["bbox"], "attribuzione": osm["attribuzione"]}

    testa = (f'<title>{TITOLO}</title>\n'
             f'<meta name="claude:viewport-fit-sides" content="cover">\n'
             f'<meta name="description" content="Mappa di prova dei locali non residenziali del Comune di Taranto (elenco beni immobili 2024). Dati da verificare.">\n'
             f'<link rel="preconnect" href="https://fonts.googleapis.com">\n'
             f'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
             f'<link rel="stylesheet" href="{FONT}">\n')

    # 1) file unico per claude.ai (frammento, tutto incorporato)
    dati_js = ("window.MAPPA_DATI=" + json.dumps({"edifici": gj_edifici, "base": gj_base, "meta": meta, "osm": osm},
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
    url = {"edifici": "dati/edifici.geojson", "base": "dati/base.geojson", "meta": meta, "osm": "dati/osm/"}
    indice = ('<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
              '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
              + testa +
              f'<link rel="stylesheet" href="{MAPLIBRE_CSS}">\n<link rel="stylesheet" href="assets/app.css">\n'
              f'<script src="{MAPLIBRE_JS}"></script>\n</head>\n<body>\n{corpo}\n'
              f'<script>window.MAPPA_DATI_URL={json.dumps(url, ensure_ascii=False)};</script>\n'
              '<script src="assets/app.js"></script>\n</body>\n</html>\n')
    open(os.path.join(SITO, "index.html"), "w", encoding="utf-8").write(indice)

    kb = lambda s: len(s.encode("utf-8")) / 1024
    print(f"in mappa: {len(feats)} particelle, {st['locali']} locali · solo abitazioni (non pubblicate): {st['solo_abitazioni']} · "
          f"edifici.geojson {kb(s_ed):.0f} KB · base.geojson {kb(s_base):.0f} KB · pagina-claude.html {kb(pagina):.0f} KB")
    print("numeri:", json.dumps(numeri, ensure_ascii=False))


if __name__ == "__main__":
    main()
