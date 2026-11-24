"""Cerca in rete foto e pagine degli edifici in mappa, prima dei sopralluoghi.

Uso (dalla radice del repository):
    python3 scripts/cerca_foto_online.py

Per ogni edificio di sito/dati/edifici.geojson:
  1. Wikimedia Commons: file con coordinate entro RAGGIO_FOTO metri dal punto (licenza e autore dai metadati).
  2. Wikipedia in italiano: voci con coordinate entro RAGGIO_VOCI metri.
  3. Articoli già citati nella scheda (note con link non istituzionale): se la pagina dichiara un'immagine (og:image).

Scrive dati/foto-online/trovate.json. Non scarica immagini e non le pubblica: è un elenco da guardare.
Attenzione: «vicino al punto» non vuol dire «foto di quell'edificio»: ogni foto va guardata prima di usarla.
Le foto dei giornali sono protette: si può solo mettere il link all'articolo.
"""
import json, math, os, re, sys, time, urllib.parse, urllib.request

RADICE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(RADICE, "dati/foto-online/trovate.json")
UA = "censimento-edifici-taranto/0.1 (ricerca di foto con licenza aperta)"
RAGGIO_FOTO, RAGGIO_VOCI, PAUSA = 80, 150, 2.5
ISTITUZIONALI = ("trasparenza", "comune.taranto", "istruzione", "miur", "agenziaentrate", "openstreetmap", "gov.it", "municipiumapp")


def leggi(url, ua=UA, n=3):
    for i in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ua}), timeout=25) as r:
                return r.read()
        except Exception as e:  # rete: riprova con calma
            err = e
            time.sleep((45 if getattr(e, "code", 0) == 429 else 4) * (i + 1))  # 429: Wikimedia chiede di rallentare
    raise err


def api(host, **par):
    par.update(format="json", formatversion="2")
    return json.loads(leggi(f"https://{host}/w/api.php?" + urllib.parse.urlencode(par)))


def metri(a, b):
    k = math.cos(math.radians(a[0])) * 111320
    return round(math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * k))


def pulisci(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()[:200]


def main():
    feats = json.load(open(os.path.join(RADICE, "sito/dati/edifici.geojson"), encoding="utf-8"))["features"]
    fatto = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    for k, f in enumerate(feats):
        p = f["properties"]
        if p["id"] in fatto:
            continue
        pt = (p["lat"], p["lon"])
        r = {"foto_commons": [], "voci_wikipedia": [], "articoli": []}
        try:
            d = api("commons.wikimedia.org", action="query", generator="geosearch", ggscoord=f"{pt[0]}|{pt[1]}",
                    ggsradius=RAGGIO_FOTO, ggsnamespace=6, ggslimit=30, prop="imageinfo|coordinates",
                    iiprop="url|extmetadata", iiextmetadatafilter="LicenseShortName|Artist|ImageDescription|DateTimeOriginal")
            for pg in (d.get("query") or {}).get("pages", []):
                ii = (pg.get("imageinfo") or [{}])[0]
                em = ii.get("extmetadata") or {}
                c = (pg.get("coordinates") or [{}])[0]
                r["foto_commons"].append({
                    "titolo": pg["title"], "pagina": ii.get("descriptionurl"), "licenza": pulisci((em.get("LicenseShortName") or {}).get("value")),
                    "autore": pulisci((em.get("Artist") or {}).get("value")), "descrizione": pulisci((em.get("ImageDescription") or {}).get("value")),
                    "data": pulisci((em.get("DateTimeOriginal") or {}).get("value"))[:10],
                    "distanza_m": metri(pt, (c["lat"], c["lon"])) if "lat" in c else None})
            r["foto_commons"].sort(key=lambda x: x["distanza_m"] if x["distanza_m"] is not None else 999)
            time.sleep(PAUSA)
            d = api("it.wikipedia.org", action="query", list="geosearch", gscoord=f"{pt[0]}|{pt[1]}", gsradius=RAGGIO_VOCI, gslimit=5)
            r["voci_wikipedia"] = [{"titolo": v["title"], "distanza_m": round(v["dist"]),
                                    "url": "https://it.wikipedia.org/wiki/" + urllib.parse.quote(v["title"].replace(" ", "_"))}
                                   for v in (d.get("query") or {}).get("geosearch", [])]
            time.sleep(PAUSA)
        except Exception as e:
            print(p["id"], "errore Wikimedia:", e, file=sys.stderr)
            continue  # si riprova al prossimo lancio
        for n in (p.get("online") or {}).get("note", []):
            u = n.get("url")
            if not u or any(x in urllib.parse.urlparse(u).netloc for x in ISTITUZIONALI) or u.lower().endswith(".pdf"):
                continue
            try:
                h = leggi(u, ua="Mozilla/5.0 (X11; Linux x86_64)", n=1)[:400000].decode("utf-8", "replace")
                m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', h) or \
                    re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', h)
                r["articoli"].append({"url": u, "fonte": n.get("fonte"), "immagine": m.group(1) if m else None, "letto": True})
            except Exception as e:
                r["articoli"].append({"url": u, "fonte": n.get("fonte"), "immagine": None, "letto": False, "errore": str(e)[:80]})
        fatto[p["id"]] = r
        json.dump(fatto, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(k + 1, "/", len(feats), p["id"], len(r["foto_commons"]), len(r["voci_wikipedia"]), len(r["articoli"]), flush=True)


if __name__ == "__main__":
    main()
