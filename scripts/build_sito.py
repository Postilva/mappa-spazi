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
FONT = "https://fonts.googleapis.com/css2?family=Anton&family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap"
TITOLO = "Patrimonio comune"
URL_SITO = "https://patrimonio.postilva.it"
WEB = os.path.join(SITO, "web")  # cartella da pubblicare sul dominio (si copia nel repository pubblico)
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
            if "piano-alienazioni" in os.path.basename(fn):
                t["piano"] = True
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


FAVICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0b0b0c"/>'
           '<path d="M4 8 12 3.5 20 8" fill="none" stroke="#e0b56a" stroke-width="1.8" stroke-linejoin="round"/><g fill="#e0b56a">'
           '<rect x="5" y="10" width="3.6" height="3.6" rx=".7"/><rect x="10.2" y="10" width="3.6" height="3.6" rx=".7"/><rect x="15.4" y="10" width="3.6" height="3.6" rx=".7"/>'
           '<rect x="5" y="15.4" width="3.6" height="3.6" rx=".7"/><rect x="10.7" y="15.4" width="2.6" height="5.2" rx=".5"/><rect x="15.4" y="15.4" width="3.6" height="3.6" rx=".7"/></g></svg>')


def icone(cart):
    """Icone PNG e ICO dal segno dello strumento (lo stesso di FAVICON), per Google (multipli di 48 px) e per i telefoni.
    Serve Pillow; se manca, restano le icone già presenti in sito/src/icone/."""
    dest = os.path.join(SRC, "icone")
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("ATTENZIONE: Pillow assente, uso le icone già in sito/src/icone/", file=sys.stderr)
    else:
        os.makedirs(dest, exist_ok=True)
        K = 32  # disegno a 24 x 32 = 768 px, poi riduco
        im = Image.new("RGBA", (24 * K, 24 * K), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        q = lambda *v: [int(round(x * K)) for x in v]
        d.rounded_rectangle(q(0, 0, 24, 24), radius=5 * K, fill="#0b0b0c")
        d.line([tuple(q(4, 8)), tuple(q(12, 3.5)), tuple(q(20, 8))], fill="#e0b56a", width=int(1.8 * K), joint="curve")
        for x, y, w, h, r in ((5, 10, 3.6, 3.6, .7), (10.2, 10, 3.6, 3.6, .7), (15.4, 10, 3.6, 3.6, .7),
                              (5, 15.4, 3.6, 3.6, .7), (10.7, 15.4, 2.6, 5.2, .5), (15.4, 15.4, 3.6, 3.6, .7)):
            d.rounded_rectangle(q(x, y, x + w, y + h), radius=int(r * K), fill="#e0b56a")
        for nome, px in (("icona-48.png", 48), ("icona-96.png", 96), ("icona-192.png", 192), ("apple-touch-icon.png", 180)):
            out = im.resize((px, px), Image.LANCZOS)
            if nome.startswith("apple"):  # iOS non vuole trasparenze
                fondo = Image.new("RGB", (px, px), "#0b0b0c"); fondo.paste(out, mask=out.split()[3]); out = fondo
            out.save(os.path.join(dest, nome), optimize=True)
        im.resize((48, 48), Image.LANCZOS).save(os.path.join(dest, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    import shutil
    for fn in glob.glob(os.path.join(dest, "*")):
        shutil.copy(fn, os.path.join(cart, os.path.basename(fn)))


PAGINA_404 = """<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Pagina non trovata – Patrimonio comune</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/fonts.css">
<style>
body { background: #0b0b0c; color: #f4f4f5; font: 17px/1.55 "Space Grotesk", "Segoe UI", system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; }
main { max-width: 34em; padding: 32px 20px; }
p.k { font: 12px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; color: #a1a1aa; margin: 0; }
h1 { font-size: clamp(30px, 6vw, 44px); line-height: 1.08; margin: 12px 0; font-weight: 600; }
h1 em { font-style: normal; color: #e0b56a; }
p { color: #a1a1aa; margin: 0 0 22px; }
a.b { display: inline-flex; align-items: center; min-height: 48px; padding: 12px 22px; border-radius: 14px; background: #e0b56a; color: #111; font-weight: 600; text-decoration: none; margin: 0 8px 8px 0; }
a.b.s { background: none; color: #f4f4f5; border: 1px solid #27272a; }
a:focus-visible { outline: 2px solid #e0b56a; outline-offset: 3px; }
</style>
</head>
<body>
<main>
<p class="k">Patrimonio comune · errore 404</p>
<h1>Questa pagina <em>non c'è.</em></h1>
<p>L'indirizzo è sbagliato o la pagina è stata spostata. Il censimento degli edifici del Comune di Taranto è qui:</p>
<a class="b" href="/#mappa">Apri la mappa</a><a class="b s" href="/">Pagina iniziale</a>
</main>
</body>
</html>
"""


def web_sito(corpo, css, js, meta, testa):
    """Scrive sito/web/: la versione per patrimonio.postilva.it (Vercel). Nessuna richiesta a server esterni."""
    import shutil
    if os.path.isdir(WEB):
        shutil.rmtree(WEB)
    for d in ("assets/fonts", "assets/vendor", "img", "dati"):
        os.makedirs(os.path.join(WEB, d), exist_ok=True)
    V = os.path.join(SRC, "vendor")
    shutil.copy(os.path.join(V, f"maplibre-gl-{MAPLIBRE}.js"), os.path.join(WEB, "assets/vendor/maplibre-gl.js"))
    shutil.copy(os.path.join(V, f"maplibre-gl-{MAPLIBRE}.css"), os.path.join(WEB, "assets/vendor/maplibre-gl.css"))
    shutil.copy(os.path.join(V, "three-r128.min.js"), os.path.join(WEB, "assets/vendor/three.min.js"))
    for fn in glob.glob(os.path.join(V, "fonts/*.woff2")):
        shutil.copy(fn, os.path.join(WEB, "assets/fonts", os.path.basename(fn)))
    shutil.copy(os.path.join(V, "fonts/fonts.css"), os.path.join(WEB, "assets/fonts.css"))
    for fn in glob.glob(os.path.join(SRC, "img/*")):
        shutil.copy(fn, os.path.join(WEB, "img", os.path.basename(fn)))
    for fn in ("edifici.geojson", "base.geojson"):
        shutil.copy(os.path.join(SITO, "dati", fn), os.path.join(WEB, "dati", fn))
    shutil.copytree(os.path.join(SITO, "dati/osm"), os.path.join(WEB, "dati/osm"))
    open(os.path.join(WEB, "assets/app.css"), "w", encoding="utf-8").write(css)
    open(os.path.join(WEB, "assets/app.js"), "w", encoding="utf-8").write(js)
    open(os.path.join(WEB, "favicon.svg"), "w", encoding="utf-8").write(FAVICON)
    import hashlib
    versione = hashlib.sha1((css + js).encode("utf-8")).hexdigest()[:10]  # cambia a ogni modifica: il browser riscarica
    url = {"edifici": "dati/edifici.geojson?v=" + versione, "base": "dati/base.geojson?v=" + versione, "meta": meta, "osm": "dati/osm/"}
    pagina = ('<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
              '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + testa +
              '<link rel="stylesheet" href="assets/vendor/maplibre-gl.css">\n<link rel="stylesheet" href="assets/app.css?v=' + versione + '">\n'
              '<script src="assets/vendor/maplibre-gl.js"></script>\n</head>\n<body>\n' + corpo + '\n'
              '<script>window.THREE_URL="assets/vendor/three.min.js";window.MAPPA_DATI_URL=' + json.dumps(url, ensure_ascii=False).replace("</", "<\\/") + ';</script>\n'
              '<script src="assets/app.js?v=' + versione + '"></script>\n</body>\n</html>\n')
    open(os.path.join(WEB, "index.html"), "w", encoding="utf-8").write(pagina)
    open(os.path.join(WEB, "404.html"), "w", encoding="utf-8").write(PAGINA_404)  # pagina d'errore vera, non la home
    icone(WEB)
    open(os.path.join(WEB, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {URL_SITO}/sitemap.xml\n")
    oggi = meta.get("generato") or ""
    open(os.path.join(WEB, "sitemap.xml"), "w").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'  <url><loc>{URL_SITO}/</loc><lastmod>{oggi}</lastmod></url>\n</urlset>\n')
    json.dump({"cleanUrls": True, "headers": [
        {"source": "/dati/osm/(.*)", "headers": [{"key": "Cache-Control", "value": "public, max-age=604800"}]},
        {"source": "/assets/(vendor|fonts)/(.*)", "headers": [{"key": "Cache-Control", "value": "public, max-age=604800"}]},
        {"source": "/(.*)\\.(html|js|css|json|geojson)", "headers": [{"key": "Cache-Control", "value": "public, max-age=0, must-revalidate"}]},
        {"source": "/", "headers": [{"key": "Cache-Control", "value": "public, max-age=0, must-revalidate"}]},
        {"source": "/(.*)", "headers": [{"key": "X-Content-Type-Options", "value": "nosniff"},
                                        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"}]}]},
              open(os.path.join(WEB, "vercel.json"), "w"), indent=1)


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
        "tamburi": sum(1 for f in feats if f["properties"].get("quartiere") == "Tamburi"),
        "nel_piano": sum(1 for f in feats if (f["properties"].get("online") or {}).get("piano")),
        # piano delle alienazioni e valorizzazioni 2026-2028 (DUP, delibera di Consiglio n. 30/2026): voci contate dall'hub,
        # progetti/mappa-spazi/ricerca/2026-11-23_piano-alienazioni-2026-2028.csv
        "piano_alienazioni": 82, "piano_valorizzazioni": 82,
        "resto": sum(1 for f in feats if f["properties"].get("quartiere") != "Tamburi"),
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
    corpo = corpo.replace("__LOGO__", leggi("logo.svg").strip())
    foto = base64.b64encode(open(os.path.join(SRC, "img/apertura.jpg"), "rb").read()).decode()
    css_web = css + "\n:root { --foto-apertura: url(../img/apertura.jpg); }\n"
    css = css + "\n:root { --foto-apertura: url(data:image/jpeg;base64," + foto + "); }\n"
    css_ml = leggi(f"vendor/maplibre-gl-{MAPLIBRE}.css")
    generato = max((f["properties"].get("ultima_modifica") or "" for f in feats), default="")
    import datetime
    generato = max(generato, datetime.date.today().isoformat())  # anche la ricerca online aggiorna i dati
    osm = osm_incorporato()
    meta = {"generato": generato, "maplibre": MAPLIBRE, "titolo": TITOLO, "tipi": tipi.TIPI, "numeri": numeri, "fonti": fonti}
    p_contatti = os.path.join(RADICE, "dati/contatti.json")  # email, PEC e modulo «Scrivici»
    meta["contatti"] = json.load(open(p_contatti, encoding="utf-8")) if os.path.exists(p_contatti) else {}
    p_notizie = os.path.join(RADICE, "dati/notizie.json")  # notizie della fascia in home, la prima è la più recente
    meta["notizie"] = json.load(open(p_notizie, encoding="utf-8")) if os.path.exists(p_notizie) else []
    if osm:
        meta["osm"] = {"zoom": osm["zoom"], "bbox": osm["bbox"], "attribuzione": osm["attribuzione"]}

    testa = (f'<title>{TITOLO}</title>\n'
             f'<meta name="claude:viewport-fit-sides" content="cover">\n'
             f'<meta name="description" content="Patrimonio comune: il censimento degli edifici del Comune di Taranto, edificio per edificio. Versione di prova, dati da verificare. Un progetto di Postilva.">\n'
             f'<link rel="preconnect" href="https://fonts.googleapis.com">\n'
             f'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
             f'<link rel="stylesheet" href="{FONT}">\n')

    testa_web = (f'<title>{TITOLO} – il censimento degli edifici del Comune di Taranto</title>\n'
                 f'<meta name="description" content="Il patrimonio del Comune di Taranto, edificio per edificio: mappa, schede e fonti. Un progetto di Postilva.">\n'
                 f'<link rel="canonical" href="{URL_SITO}/">\n'
                 f'<meta property="og:type" content="website">\n<meta property="og:title" content="{TITOLO}">\n'
                 f'<meta property="og:description" content="Il patrimonio del Comune di Taranto, edificio per edificio. Un progetto di Postilva.">\n'
                 f'<meta property="og:image" content="{URL_SITO}/img/anteprima.jpg">\n<meta property="og:url" content="{URL_SITO}/">\n'
                 f'<meta name="twitter:card" content="summary_large_image">\n'
                 f'<meta name="theme-color" content="#0b0b0c">\n'
                 f'<link rel="icon" href="favicon.svg" type="image/svg+xml">\n'
                 f'<link rel="icon" href="icona-48.png" sizes="48x48" type="image/png">\n'
                 f'<link rel="icon" href="icona-192.png" sizes="192x192" type="image/png">\n'
                 f'<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
                 # nome del sito per Google (come su bonifiche.postilva.it)
                 + '<script type="application/ld+json">' + json.dumps({
                     "@context": "https://schema.org", "@type": "WebSite", "name": TITOLO, "alternateName": "Patrimonio comune – Postilva",
                     "url": URL_SITO + "/", "inLanguage": "it",
                     "publisher": {"@type": "Organization", "name": "Postilva", "url": "https://www.postilva.it/"}}, ensure_ascii=False) + '</script>\n' +
                 f'<link rel="stylesheet" href="assets/fonts.css">\n')

    # 1) file unico per claude.ai (frammento, tutto incorporato)
    dati_js = ("window.MAPPA_DATI=" + json.dumps({"edifici": gj_edifici, "base": gj_base, "meta": meta, "osm": osm},
                                                  ensure_ascii=False, separators=(",", ":")) + ";")
    dati_js = dati_js.replace("</", "<\\/")
    pagina = (testa + f'<script src="{MAPLIBRE_JS}"></script>\n'
              f"<style>\n{css_ml}\n{css}\n</style>\n{corpo}\n<script>\n{dati_js}\n</script>\n<script>\n{js}\n</script>\n")
    os.makedirs(os.path.join(SITO, "dist"), exist_ok=True)
    open(os.path.join(SITO, "dist/pagina-claude.html"), "w", encoding="utf-8").write(pagina)

    # 2) versione per il dominio (patrimonio.postilva.it): file separati, tutto servito dal nostro server
    web_sito(corpo, css_web, js, meta, testa_web)

    kb = lambda s: len(s.encode("utf-8")) / 1024
    print(f"in mappa: {len(feats)} particelle, {st['locali']} locali · solo abitazioni (non pubblicate): {st['solo_abitazioni']} · "
          f"edifici.geojson {kb(s_ed):.0f} KB · base.geojson {kb(s_base):.0f} KB · pagina-claude.html {kb(pagina):.0f} KB")
    print("numeri:", json.dumps(numeri, ensure_ascii=False))


if __name__ == "__main__":
    main()
