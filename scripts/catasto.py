"""Accesso al servizio WFS INSPIRE della cartografia catastale (Agenzia delle Entrate).

Servizio: https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php
Licenza: CC BY 4.0, titolare Agenzia delle Entrate (dichiarato in GetCapabilities
di WFS e WMS: <Fees>CC BY 4.0</Fees>).

Identificativi INSPIRE (esempio «L049A0202A0.129»):
  L049   codice catastale del Comune di Taranto
  A      sezione (a Taranto solo «A»)
  0202   foglio
  A      allegato («0» = nessuno)
  0      sviluppo («0» = nessuno; X/Y/Z = sviluppi)
  .129   particella (dopo il punto)

Coordinate: EPSG:6706 (RDN2008), ordine lat lon nel GML 3.2. La differenza con
WGS84/ETRS89 è sotto il metro: per la mappa si usano come lat/lon WGS84.

Massimo 500 oggetti per richiesta (valori più alti sono rifiutati): chi chiama
controlla numberMatched == numberReturned e divide il riquadro se serve.

Le risposte vengono messe in cache in `.cache/catasto/` (non versionata) per non
ripetere le richieste. Pausa di cortesia tra le richieste: PAUSA secondi.
"""
import hashlib, os, re, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

WFS = "https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php"
UA = "mappa-spazi/0.1"
PAUSA = 3.0
CACHE = os.path.join(os.path.dirname(__file__), "..", ".cache", "catasto")
NS = {"gml": "http://www.opengis.net/gml/3.2", "wfs": "http://www.opengis.net/wfs/2.0",
      "CP": "http://mapserver.gis.umn.edu/mapserver"}
RIF = re.compile(r"^(?P<comune>[A-Z]\d{3})(?P<sezione>[A-Z_])(?P<foglio>\d{4})(?P<allegato>[0-9A-Z])(?P<sviluppo>[0-9A-Z])(?:\.(?P<particella>.+))?$")

_ultima = [0.0]


def get(params, tentativi=4):
    """GET sul WFS con cache su disco, pausa tra richieste e retry (2,4,8,16 s)."""
    url = WFS + "?" + urllib.parse.urlencode(params, safe=":,")
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ".xml")
    if os.path.exists(f):
        return open(f, "rb").read()
    for i in range(tentativi + 1):
        attesa = PAUSA - (time.time() - _ultima[0])
        if attesa > 0:
            time.sleep(attesa)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            data = urllib.request.urlopen(req, timeout=180).read()
            _ultima[0] = time.time()
            if b"FeatureCollection" not in data[:2000]:
                raise IOError("risposta inattesa: " + data[:300].decode("latin1"))
            open(f, "wb").write(data)
            return data
        except Exception as e:
            _ultima[0] = time.time()
            if i == tentativi:
                raise
            time.sleep(2 ** (i + 1))


def get_features(tipo, bbox):
    """tipo: 'CP:CadastralParcel' o 'CP:CadastralZoning'; bbox = (lat_min, lon_min, lat_max, lon_max).
    Restituisce (lista di feature, numberMatched, numberReturned)."""
    data = get({"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature", "TYPENAMES": tipo,
                "BBOX": "%.6f,%.6f,%.6f,%.6f,urn:ogc:def:crs:EPSG::6706" % bbox, "COUNT": "500"})
    root = ET.fromstring(data)
    out = []
    for m in root.findall("wfs:member", NS):
        el = m[0]
        ref = (el.findtext("CP:NATIONALCADASTRALREFERENCE", namespaces=NS)
               or el.findtext("CP:NATIONALCADASTRALZONINGREFERENCE", namespaces=NS))
        polys = []
        for p in el.iter("{%s}Polygon" % NS["gml"]):
            rings = []
            for ring in p.iter("{%s}posList" % NS["gml"]):
                v = [float(x) for x in ring.text.split()]
                rings.append([(v[i + 1], v[i]) for i in range(0, len(v), 2)])  # (lon, lat)
            polys.append(rings)
        out.append({"ref": ref, "label": el.findtext("CP:LABEL", namespaces=NS),
                    "inizio_validita": el.findtext("CP:BEGINLIFESPANVERSION", namespaces=NS),
                    "poligoni": polys})
    return out, root.get("numberMatched"), root.get("numberReturned")


def scomponi(ref):
    m = RIF.match(ref or "")
    if not m:
        return None
    d = m.groupdict()
    d["foglio_n"] = int(d["foglio"])
    return d
