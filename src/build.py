"""Assembla atlante.html: template + dati + app + SVG ottimizzati (SVGO, cleanupIDs disattivato).

Uso: python3 src/build.py <cartella-svg-ottimizzati>
"""
import pathlib, re, sys

src = pathlib.Path(__file__).parent
svg_dir = pathlib.Path(sys.argv[1])
out = src.parent / 'atlante.html'

def svg(name):
    s = (svg_dir / f'{name}.svg').read_text(encoding='utf-8')
    return re.sub(r'<\?xml[^>]*\?>', '', s).strip()

data = '\n'.join((src / f).read_text(encoding='utf-8') for f in
                 ['data_neuro.js', 'data_head_cardio_resp.js', 'data_dig_uro_repro.js', 'data_endo_imm_tess.js'])
html = (src / 'template.html').read_text(encoding='utf-8')
html = (html.replace('<!--SVG_MALE-->', svg('male'))
            .replace('<!--SVG_BRAIN-->', svg('brain'))
            .replace('/*DATA*/', data)
            .replace('/*APP*/', (src / 'app.js').read_text(encoding='utf-8')))
out.write_text(html, encoding='utf-8')
print(out, f'{len(html.encode()) / 1024:.0f} KB')

# Anteprima locale con lo scheletro che la pubblicazione aggiunge da sé.
preview = src.parent / 'proto' / 'atlante.html'
preview.parent.mkdir(exist_ok=True)
preview.write_text('<!doctype html><html lang="it"><head><meta charset="utf-8">'
                   '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
                   '<style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>'
                   + html + '</body></html>', encoding='utf-8')
