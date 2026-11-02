"""Construit public/template/fiche.pptx à partir d'une fiche d'information existante (le PPT de référence).
Garde le masque, les dispositions, le thème, l'étiquette de confidentialité ; retire les pages et leurs images.
Orange du thème (accent2) passé à F37A1F (charte STIHL). Usage : python3 tools/make_template.py source.pptx sortie.pptx"""
import re, sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src)
drop = re.compile(r"^(ppt/(slides|notesSlides|media|tags|changesInfos)/|ppt/revisionInfo\.xml|\[trash\]/)")
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
    for i in zin.infolist():
        n = i.filename
        if drop.match(n):
            continue
        d = zin.read(n)
        if n == "ppt/presentation.xml":
            s = d.decode()
            s = re.sub(r"<p:sldIdLst>.*?</p:sldIdLst>", "", s, flags=re.S)
            d = s.encode()
        elif n == "ppt/_rels/presentation.xml.rels":
            s = d.decode()
            s = re.sub(r'<Relationship [^>]*Target="(slides/slide\d+\.xml|changesInfos/[^"]+|revisionInfo\.xml)"/>', "", s)
            d = s.encode()
        elif n == "[Content_Types].xml":
            s = d.decode()
            s = re.sub(r'<Override PartName="/ppt/(slides/|notesSlides/|tags/|changesInfos/|revisionInfo)[^"]*"[^>]*/>', "", s)
            for ext, ct in (("png", "image/png"), ("jpeg", "image/jpeg"), ("jpg", "image/jpeg")):
                if f'Extension="{ext}"' not in s:
                    s = s.replace("<Default ", f'<Default Extension="{ext}" ContentType="{ct}"/><Default ', 1)
            d = s.encode()
        elif n.startswith("ppt/theme/theme"):
            s = d.decode()
            s = re.sub(r'(<a:accent2>\s*<a:srgbClr val=")[0-9A-Fa-f]{6}', r"\g<1>F37A1F", s)
            d = s.encode()
        elif n == "docProps/app.xml":
            s = d.decode()
            s = re.sub(r"<Slides>\d+</Slides>", "<Slides>0</Slides>", s)
            s = re.sub(r"<Notes>\d+</Notes>", "<Notes>0</Notes>", s)
            d = s.encode()
        z.writestr(i, d)
print("ok", dst)
