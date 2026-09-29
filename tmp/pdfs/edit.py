import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'deps'))
import pymupdf as f

root = Path(__file__).parent
d = f.open(r'C:\Users\turki\Downloads\مطوية_الهمزة_المتوسطة.pdf')
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
for source, name, axes in [('sans-full.ttf','regular.ttf',{'wght':400,'wdth':100}),('kufi-full.ttf','bold.ttf',{'wght':800})]:
    font = instantiateVariableFont(TTFont(root/source), axes, inplace=True)
    font.save(root/name)
edits = [
    (0, (650,475,800,484), 'اسم الطالبة: لمى فهد المفرج', 10.2993, 3158084, 'regular.ttf', 795.78, 482.955, None),
    (0, (690,494,800,503), 'الصف: خامس/أول', 10.2993, 3158084, 'regular.ttf', 795.78, 501.495, None),
    (0, (640,379,763,390), 'نتعرف إلى موضع الهمزة', 13, 5328230, 'regular.ttf', None, 389.035, 701.58),
    (1, (64,47,259,62), 'اختاري موضع الهمزة', 18, 5915256, 'bold.ttf', 257.953, 60.289, None),
]
for i, rect, *_ in edits:
    d[i].add_redact_annot(f.Rect(rect), fill=False)
for p in d:
    p.apply_redactions(images=0, graphics=0)
for i, rect, text, size, color, font, right, baseline, center in edits:
    tmp = f.open()
    page = tmp.new_page(width=500, height=120)
    css = f"@font-face {{font-family: original; src: url({font});}} * {{font-family: original;}} body {{margin:0;}} div {{font-size:{size}pt; color:#{color:06x}; text-align:right;}}"
    page.insert_htmlbox(f.Rect(10,25,480,110), f'<div dir="rtl">{text}</div>', css=css, archive=f.Archive(str(root)))
    spans = [s for b in page.get_text('dict')['blocks'] if 'lines' in b for l in b['lines'] for s in l['spans']]
    box = f.Rect(spans[0]['bbox'])
    for s in spans[1:]:
        box |= f.Rect(s['bbox'])
    oldbase = spans[0]['origin'][1]
    dx = right-box.x1 if right is not None else center-(box.x0+box.x1)/2
    dy = baseline-oldbase
    dest = f.Rect(dx,dy,500+dx,120+dy)
    d[i].show_pdf_page(dest,tmp,0)
    print(text.encode('unicode_escape').decode(), [s['font'] for s in spans], box)
out = Path('output/pdf')
out.mkdir(parents=True, exist_ok=True)
target = out / 'مطوية_الهمزة_المتوسطة_معدلة.pdf'
d.save(target, garbage=4, deflate=True)
d.close()
check = f.open(target)
for i,p in enumerate(check):
    p.get_pixmap(matrix=f.Matrix(1.5,1.5)).save(root / f'edited{i}.png')
print('SAVED',len(check))
