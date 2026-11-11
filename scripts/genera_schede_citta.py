#!/usr/bin/env python3
"""Schede JSON degli immobili comunali di tutta Taranto (una per particella FAB localizzata).

Input:  dati/fonti/elenco-immobili-2024.csv, dati/citta/posizioni.csv, dati/citta/poligoni.geojson,
        dati/geo/tamburi-confine.geojson, sito/dati/osm/ (tessere OpenStreetMap), dati/edifici/_modello.json
Output: dati/edifici/<foglio>-<particella>.json   (tutte le particelle localizzate, abitazioni comprese:
                                                    cosa va sulla mappa pubblica lo decide build_sito.py)
        dati/citta/da-localizzare.csv             (particelle FAB senza posizione: nessuna scheda)

Regole: nessun dato inventato. `nome` e `indirizzo` restano vuoti e lo stato è «da_verificare».
Due campi nuovi aiutano a riconoscere il posto ma NON sono verificati:
  via_vicina  la strada con nome più vicina al poligono della particella (OpenStreetMap, entro 60 m);
  zona        il quartiere o la località più vicina tra le etichette di OpenStreetMap (entro 3 km).
Le schede già modificate a mano non vengono sovrascritte: si aggiornano solo i campi generati
(unità, posizione, via_vicina, zona, quartiere se vuoto).
Uso: python3 scripts/genera_schede_citta.py   (shapely, mapbox-vector-tile)
"""
import copy, csv, glob, json, math, os, sys, warnings
from collections import Counter, defaultdict
warnings.filterwarnings("ignore")
import mapbox_vector_tile
from shapely.geometry import shape, Point
from shapely.ops import transform

DATA = "2026-11-10"
R = os.path.join(os.path.dirname(__file__), "..")
P = lambda *a: os.path.join(R, *a)
OSM = P("sito/dati/osm")
MAX_VIA_M, MAX_ZONA_M = 60, 3000
STRADE = {"motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"}
LUOGHI = {"suburb", "quarter", "neighbourhood", "town", "village", "hamlet"}
FONTI = [
    {"titolo": "Elenco beni immobili – anno 2024", "ente": "Comune di Taranto, Direzione Patrimonio e Demanio – Politiche abitative",
     "data": "2024-05-29", "url": "https://taranto.trasparenza-valutazione-merito.it/web/trasparenza/papca-g/-/papca/display/3570721",
     "uso": "identificativi, foglio, particella, subalterni e categorie catastali"},
    {"titolo": "Cartografia catastale – servizio WFS INSPIRE (CP:CadastralParcel)", "ente": "Agenzia delle Entrate",
     "data": DATA, "url": "https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php", "licenza": "CC BY 4.0",
     "uso": "posizione: baricentro (o punto interno) del poligono della particella, consultato il " + DATA},
    {"titolo": "OpenStreetMap (tessere OpenFreeMap, schema OpenMapTiles)", "ente": "© OpenStreetMap contributors",
     "data": "2026-11-01", "url": "https://www.openstreetmap.org/copyright", "licenza": "ODbL",
     "uso": "via più vicina e zona indicativa: ricavate in automatico, non verificate"},
]

# proiezione locale in metri (basta per distanze di decine di metri)
LAT0 = 40.47
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110540
metri = lambda x, y, z=None: (x * KX, y * KY)


def tessera(lon, lat, z=14):
    n = 2 ** z
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


_cache = {}
def leggi(z, x, y):
    """Feature (in metri) dei layer che servono, per una tessera; None se la tessera non c'è."""
    k = (z, x, y)
    if k in _cache:
        return _cache[k]
    f = os.path.join(OSM, str(z), str(x), f"{y}.pbf")
    if not os.path.exists(f):
        _cache[k] = None
        return None
    d = mapbox_vector_tile.decode(open(f, "rb").read(), default_options={"y_coord_down": True})
    n = 2 ** z
    def lonlat(px, py, ext):
        lon = (x + px / ext) / n * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + py / ext) / n))))
        return lon, lat
    out = {"strade": [], "luoghi": []}
    for nome, chiave in (("transportation_name", "strade"), ("place", "luoghi")):
        lay = d.get(nome)
        if not lay:
            continue
        ext = lay["extent"]
        for ft in lay["features"]:
            pr = ft["properties"]
            nm = pr.get("name:it") or pr.get("name")
            if not nm:
                continue
            if chiave == "strade" and not (pr.get("class") in STRADE or (pr.get("class") == "path" and pr.get("subclass") == "pedestrian")):
                continue
            if chiave == "luoghi" and pr.get("class") not in LUOGHI:
                continue
            g = transform(lambda px, py, pz=None: metri(*lonlat(px, py, ext)), shape(ft["geometry"]))
            out[chiave].append((nm, g))
    _cache[k] = out
    return out


def via_vicina(poligono_m, lon, lat):
    x, y = tessera(lon, lat)
    migliore = None
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            t = leggi(14, x + dx, y + dy)
            for nm, g in (t or {}).get("strade", []):
                d = poligono_m.distance(g)
                if d <= MAX_VIA_M and (migliore is None or d < migliore[1]):
                    migliore = (nm, d)
    return migliore


def tutti_i_luoghi():
    visti = {}
    for z in (12, 13, 14):
        for f in glob.glob(os.path.join(OSM, str(z), "*", "*.pbf")):
            _, x, y = os.path.relpath(f, OSM)[:-4].split(os.sep)
            for nm, g in leggi(z, int(x), int(y))["luoghi"]:
                visti.setdefault(nm, g)
    return list(visti.items())


def main():
    modello = json.load(open(P("dati/edifici/_modello.json")))
    unita = defaultdict(list)
    for r in csv.DictReader(open(P("dati/fonti/elenco-immobili-2024.csv"), encoding="utf-8")):
        if r["tipo"] == "FAB":
            unita[(r["foglio"], r["particella"])].append(r)
    pos = {(r["foglio"], r["particella"]): r for r in csv.DictReader(open(P("dati/citta/posizioni.csv")))}
    pol = {f["properties"]["id"]: shape(f["geometry"]) for f in json.load(open(P("dati/citta/poligoni.geojson")))["features"]}
    tamburi = shape(json.load(open(P("dati/geo/tamburi-confine.geojson")))["features"][0]["geometry"])
    luoghi = tutti_i_luoghi()

    scritte, da_loc, n_via, n_zona = set(), [], 0, 0
    for (f, p), us in sorted(unita.items(), key=lambda kv: (int(kv[0][0]), kv[0][1].zfill(8))):
        po = pos.get((f, p))
        cat = Counter(u["categoria_codice"] for u in us)
        if not po or not po["lat"]:
            da_loc.append({"foglio": f, "particella": p, "unita": len(us),
                           "categorie": " ".join(f"{k}:{v}" for k, v in sorted(cat.items())),
                           "motivo": "particella non trovata nella cartografia catastale WFS (lettura completa l'11/11/2026, tranne 3 riquadri rifiutati dal servizio)"})
            continue
        lat, lon = float(po["lat"]), float(po["lon"])
        top = sorted(cat.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        desc = next(u["categoria_descrizione"] for u in us if u["categoria_codice"] == top)
        g_m = transform(metri, pol[f"{f}-{p}"]) if f"{f}-{p}" in pol else Point(metri(lon, lat))
        via = via_vicina(g_m, lon, lat)
        pt = Point(metri(lon, lat))
        z = min(((nm, pt.distance(g)) for nm, g in luoghi), key=lambda t: t[1], default=None)
        if z and z[1] > MAX_ZONA_M:
            z = None
        n_via += bool(via); n_zona += bool(z)
        generati = {
            "id": f"{f}-{p}", "foglio": f, "particella": p, "categoria_catastale": top,
            "descrizione": f"{top} – {desc} ({cat[top]} di {len(us)} unità)",
            "unita": [{"id": u["id"], "subalterno": u["subalterno"], "categoria": u["categoria_codice"],
                       "categoria_descrizione": u["categoria_descrizione"]}
                      for u in sorted(us, key=lambda u: (u["subalterno"].zfill(6), u["id"]))],
            "lat": lat, "lon": lon,
            "via_vicina": {"nome": via[0], "distanza_m": round(via[1]), "fonte": "OpenStreetMap", "verificata": False} if via else None,
            "zona": {"nome": z[0], "distanza_m": round(z[1], -1), "fonte": "OpenStreetMap", "verificata": False} if z else None,
        }
        nome = P("dati/edifici", f"{f}-{p}.json")
        if os.path.exists(nome):
            s = json.load(open(nome))
            prima = json.dumps(s, sort_keys=True)
            s.update(generati)
            if not s.get("quartiere") or s.get("ultima_modifica") == DATA:
                s["quartiere"] = "Tamburi" if tamburi.contains(Point(lon, lat)) else ""
            if s.get("ultima_modifica") == DATA:
                s["fonti"] = FONTI
            if json.dumps(s, sort_keys=True) != prima:
                s["ultima_modifica"] = DATA
        else:
            s = copy.deepcopy(modello)
            s.update(generati)
            s.update({"nome": "", "indirizzo": "", "quartiere": "Tamburi" if tamburi.contains(Point(lon, lat)) else "",
                      "stato": "da_verificare", "storia": [], "fonti": FONTI, "ultima_modifica": DATA})
        # ordine dei campi come nel modello
        s = {k: s[k] for k in list(modello) if k in s} | {k: v for k, v in s.items() if k not in modello}
        with open(nome, "w") as fh:
            json.dump(s, fh, ensure_ascii=False, indent=2); fh.write("\n")
        scritte.add(os.path.basename(nome))

    os.makedirs(P("dati/citta"), exist_ok=True)
    with open(P("dati/citta/da-localizzare.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["foglio", "particella", "unita", "categorie", "motivo"])
        w.writeheader(); w.writerows(da_loc)
    print("schede:", len(scritte), "· con via vicina:", n_via, "· con zona:", n_zona, "· da localizzare:", len(da_loc))


if __name__ == "__main__":
    main()
