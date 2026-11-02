"""Preuve de parité : PDF du moteur contre PPTX rendu par LibreOffice.

Pour chaque page, les deux rendus sont rastérisés à 300 dpi. On mesure :
  1. l'encre hors tolérance : % de pixels encrés d'un rendu qui ne tombent pas à moins de 0,5 mm d'un pixel encré de l'autre ;
  2. l'écart des bords de chaque bloc (texte et tableau, positions lues dans layout.json) : gauche, haut, droite, bas, en mm.
Sortie : un JSON de résultats + une image de superposition par page (rouge = PDF seul, bleu = PPTX seul, noir = commun).
Usage : python3 tests/parity.py <book.pdf> <book-lo.pdf> <layout.json> <dossier sortie>
"""
import json, subprocess, sys, os
import numpy as np
from PIL import Image, ImageFilter

DPI = 300
MM = DPI / 25.4
TOL_MM = 0.5


def raster(pdf, prefix):
    subprocess.run(["pdftoppm", "-r", str(DPI), "-gray", "-png", pdf, prefix], check=True)
    files = sorted(f for f in os.listdir(os.path.dirname(prefix)) if f.startswith(os.path.basename(prefix) + "-"))
    return [os.path.join(os.path.dirname(prefix), f) for f in files]


def ink(path):
    a = np.asarray(Image.open(path).convert("L"), dtype=np.uint8)
    return a < 200  # tout ce qui n'est pas blanc / quasi blanc


def dilate(mask, r):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.MaxFilter(2 * r + 1))) > 0


def text_lines(page):
    """Lignes de texte noir calculées par le moteur : (police, boîte mm) — le texte blanc sur fond orange est exclu."""
    out = []
    def add(lines, ox, oy):
        for l in lines:
            segs = [g for g in l["segs"] if g["text"].strip() and (g.get("color") or "000000") != "FFFFFF"]
            if not segs:
                continue
            x0 = ox + min(g["x"] for g in segs)
            out.append((segs[0]["font"], segs[0]["size"], "".join(g["text"] for g in segs)[:40], x0, oy + l["top"], ox + l["x"] + l["width"], oy + l["top"] + l["h"]))
    for it in page["items"]:
        if it["t"] == "text":
            add(it["lines"], it["x"] + it["ins"]["l"], it["y"] + it["ins"]["t"])
        elif it["t"] == "table":
            cx = it["x"]
            xs = []
            for w in it["cols"]:
                xs.append(cx); cx += w
            for r in it["rows"]:
                for c, cell in enumerate(r["cells"]):
                    add(cell["lines"], xs[c] + it["mar"]["l"], it["y"] + r["y"] + it["mar"]["t"])
    return out


def bbox(mask):
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def main(pdf, lo_pdf, layout_json, out):
    os.makedirs(out, exist_ok=True)
    A = raster(pdf, os.path.join(out, "a"))
    B = raster(lo_pdf, os.path.join(out, "b"))
    layout = json.load(open(layout_json))
    r = round(TOL_MM * MM)
    res = {"dpi": DPI, "tolerance_mm": TOL_MM, "pages": []}
    for i, (fa, fb) in enumerate(zip(A, B)):
        a, b = ink(fa), ink(fb)
        h = min(a.shape[0], b.shape[0]); w = min(a.shape[1], b.shape[1])
        a, b = a[:h, :w], b[:h, :w]
        da, db = dilate(a, r), dilate(b, r)
        out_a = (a & ~db).sum() / max(a.sum(), 1) * 100
        out_b = (b & ~da).sum() / max(b.sum(), 1) * 100
        # blocs
        blocks = []
        for it in layout["pages"][i]["items"]:
            if it["t"] not in ("text", "table"):
                continue
            x, y = it["x"], it["y"]
            ww = it["w"] if it["t"] == "text" else sum(it["cols"])
            hh = it["h"]
            pad = 0.8
            x0, y0 = max(int((x - pad) * MM), 0), max(int((y - pad) * MM), 0)
            x1, y1 = min(int((x + ww + pad) * MM), w), min(int((y + hh + pad) * MM), h)
            ba, bb = bbox(a[y0:y1, x0:x1]), bbox(b[y0:y1, x0:x1])
            if not ba or not bb:
                continue
            d = [abs(p - q) / MM for p, q in zip(ba, bb)]
            blocks.append({"bloc": it.get("name"), "type": it["t"], "ecart_mm": round(max(d), 3), "bords_mm": [round(v, 3) for v in d]})
        # lignes de texte noir (seuil < 110 : ignore filets gris, bordures et fonds orange)
        ka, kb = np.asarray(Image.open(fa).convert("L"))[:h, :w] < 110, np.asarray(Image.open(fb).convert("L"))[:h, :w] < 110
        lines = []
        for font, size, txt, x0, y0, x1, y1 in text_lines(layout["pages"][i]):
            X0, Y0 = max(int((x0 - 0.4) * MM), 0), max(int((y0 + 0.3) * MM), 0)  # ligne réduite de 0,3 mm en haut et en bas : ignore les jambages des lignes voisines
            X1, Y1 = min(int((x1 + 0.4) * MM), w), min(int((y1 - 0.3) * MM), h)
            ba, bb = bbox(ka[Y0:Y1, X0:X1]), bbox(kb[Y0:Y1, X0:X1])
            if not ba or not bb:
                continue
            d = [(q - p) / MM for p, q in zip(ba, bb)]  # LibreOffice − PDF, mm (gauche, haut, droite, bas)
            lines.append({"police": font, "pt": size, "texte": txt, "ecart_mm": round(max(abs(v) for v in d), 3), "d_mm": [round(v, 3) for v in d]})
        wl = max(lines, key=lambda z: z["ecart_mm"]) if lines else None
        worst = max(blocks, key=lambda z: z["ecart_mm"]) if blocks else None
        res["pages"].append({"page": i + 1, "encre_pdf_hors_tolerance_pct": round(out_a, 3), "encre_pptx_hors_tolerance_pct": round(out_b, 3),
                             "ecart_max_bloc_mm": worst["ecart_mm"] if worst else None, "bloc_le_plus_ecarte": worst["bloc"] if worst else None,
                             "lignes_mesurees": len(lines), "ecart_max_ligne_mm": wl["ecart_mm"] if wl else None, "ligne_la_plus_ecartee": wl,
                             "lignes_sous_0_5_mm_pct": round(100 * sum(1 for z in lines if z["ecart_mm"] <= TOL_MM) / max(len(lines), 1), 1),
                             "blocs": blocks, "lignes": lines})
        # superposition
        ov = np.full((h, w, 3), 255, np.uint8)
        ov[a & ~b] = (220, 30, 30)
        ov[b & ~a] = (30, 110, 220)
        ov[a & b] = (0, 0, 0)
        Image.fromarray(ov).save(os.path.join(out, f"superposition-p{i + 1}.png"))
    json.dump(res, open(os.path.join(out, "parite.json"), "w"), ensure_ascii=False, indent=1)
    for p in res["pages"]:
        print(f"page {p['page']}: {p['lignes_mesurees']} lignes, {p['lignes_sous_0_5_mm_pct']} % ≤ 0,5 mm, pire ligne {p['ecart_max_ligne_mm']} mm {p['ligne_la_plus_ecartee'] and (p['ligne_la_plus_ecartee']['police'], p['ligne_la_plus_ecartee']['texte'], p['ligne_la_plus_ecartee']['d_mm'])}")
        print(f"        écart max bloc {p['ecart_max_bloc_mm']} mm ({p['bloc_le_plus_ecarte']}) · encre hors tolérance PDF {p['encre_pdf_hors_tolerance_pct']} % / PPTX {p['encre_pptx_hors_tolerance_pct']} %")


if __name__ == "__main__":
    main(*sys.argv[1:5])
