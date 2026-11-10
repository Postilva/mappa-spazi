"""Regola di lavoro per scegliere, dall'elenco 2024, i locali non residenziali da mostrare sulla mappa.

È una scelta di Postilva (10/11/2026), non una classificazione ufficiale: va rivista con il T4.
 - Abitazioni (categorie A, tranne gli uffici A/10): mai sulla mappa pubblica.
 - Pertinenze (autorimesse C/6, tettoie C/7, aree urbane F/1, lastrici solari F/5): mai.
 - Magazzini C/2: solo se nella particella non ci sono abitazioni (altrimenti sono quasi certamente cantine).
 - Tutto il resto è un «locale di interesse», raggruppato per tipo.
"""
TIPI = [
    ("negozi", "Negozi e botteghe"),
    ("laboratori", "Laboratori"),
    ("magazzini", "Magazzini e depositi"),
    ("uffici", "Uffici"),
    ("scuole", "Scuole"),
    ("industriali", "Opifici e capannoni"),
    ("sport", "Impianti sportivi"),
    ("ruderi", "Ruderi (unità collabenti)"),
    ("altro", "Altro"),
]
PER_CATEGORIA = {
    "C01": "negozi", "C03": "laboratori", "C02": "magazzini", "A10": "uffici", "B04": "uffici",
    "B05": "scuole", "D01": "industriali", "D07": "industriali", "D08": "industriali", "D10": "industriali",
    "C04": "sport", "D06": "sport", "F02": "ruderi",
}
PERTINENZE = {"C06", "C07", "F01", "F05"}


def norm(cat):
    return (cat or "").replace("/", "").strip().upper()


def abitazione(cat):
    c = norm(cat)
    return c.startswith("A") and c != "A10"


def classifica(categorie):
    """categorie: lista dei codici delle unità di una particella.
    Restituisce (tipi_per_unita, n_abitazioni, n_pertinenze): tipi_per_unita ha None per le unità escluse."""
    cs = [norm(c) for c in categorie]
    ha_ab = any(abitazione(c) for c in cs)
    out, n_ab, n_pert = [], 0, 0
    for c in cs:
        if abitazione(c):
            n_ab += 1; out.append(None)
        elif c in PERTINENZE or (c == "C02" and ha_ab):
            n_pert += 1; out.append(None)
        else:
            out.append(PER_CATEGORIA.get(c, "altro"))
    return out, n_ab, n_pert
