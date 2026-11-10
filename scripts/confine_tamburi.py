#!/usr/bin/env python3
"""Passo 3a - Confine di lavoro del quartiere Tamburi.

OSM/Nominatim non ha un poligono per «Tamburi» (solo un punto place=suburb,
nodo 14197335999). Si usa quindi una fonte istituzionale:

  ISTAT, Basi territoriali 2021, regione Puglia (R16_21.zip), CC BY 4.0
  https://www.istat.it/storage/cartografia/basi_territoriali/2021/R16_21.zip

Confine = unione delle sezioni di censimento 2021 del Comune di Taranto
(PRO_COM 73027) che stanno nella circoscrizione 2 «Tamburi-Lido Azzurro»
(COM_ASC1 73027002) E nella località «Taranto» centro abitato
(LOC21_ID 7302710004). Restano fuori Lido Azzurro (centro abitato a sé),
le località produttive (es. «Agip Petroli-Ilva») e le case sparse.

Uso (serve un ambiente con pyshp, shapely, pyproj, NON committato):
  python scripts/confine_tamburi.py <cartella_R16_21_estratta> dati/geo/tamburi-confine.geojson
"""
import json, sys, warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
import shapefile
from shapely.geometry import shape, mapping
from shapely.ops import unary_union, transform
from pyproj import Transformer

src, out = sys.argv[1], sys.argv[2]
r = shapefile.Reader(f"{src}/SHP/R16_21_WGS84")
geoms, pop, n = [], 0, 0
for sr in r.iterShapeRecords():
    d = sr.record.as_dict()
    if d["PRO_COM"] == 73027 and d["COM_ASC1"] == 73027002 and d["LOC21_ID"] == 7302710004:
        geoms.append(shape(sr.shape.__geo_interface__).buffer(0))
        pop += d["POP21"] or 0
        n += 1
u = unary_union(geoms).buffer(0.01).buffer(-0.01)  # chiude micro-fessure tra sezioni (1 cm)
t = Transformer.from_crs("EPSG:32632", "EPSG:4326", always_xy=True).transform
g = transform(t, u)
g = transform(lambda x, y, z=None: (round(x, 7), round(y, 7)), g)
fc = {
    "type": "FeatureCollection",
    "features": [{
        "type": "Feature",
        "properties": {
            "nome": "Tamburi (confine di lavoro)",
            "definizione": "Sezioni di censimento ISTAT 2021 del Comune di Taranto nella circoscrizione 2 'Tamburi-Lido Azzurro' (COM_ASC1 73027002) e nella localita 'Taranto' centro abitato (LOC21_ID 7302710004)",
            "sezioni": n,
            "popolazione_2021": pop,
            "fonte": "ISTAT, Basi territoriali 2021 - Puglia (R16_21), https://www.istat.it/storage/cartografia/basi_territoriali/2021/R16_21.zip",
            "licenza": "CC BY 4.0 (https://www.istat.it/note-legali/) - elaborazione Postilva: unione delle sezioni e riproiezione EPSG:32632 -> EPSG:4326",
            "stato": "da_confermare: confine di lavoro, non un confine ufficiale del quartiere; va confermato dal team",
            "data": "2026-11-10",
        },
        "geometry": mapping(g),
    }],
}
json.dump(fc, open(out, "w"), ensure_ascii=False)
print(f"sezioni={n} popolazione_2021={pop} area_km2={u.area/1e6:.3f} tipo={g.geom_type} bbox={[round(v,5) for v in g.bounds]}")
