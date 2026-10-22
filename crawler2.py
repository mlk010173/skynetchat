import re, os, ssl, posixpath, urllib.request
BASE = 'https://skynetchat.net'
CTX = ssl.create_default_context()
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'}
baixados, fila, falhas, paginas = set(), [], set(), set()
TEXTO = ('html','js','css','json','svg','webmanifest','txt','mjs')
PAGINA_RE = re.compile(r'^(?!api/|cdn-cgi/)(?!\?.*$)([a-z0-9\-]+)$')

def alvo_de(ref, arquivo):
    ref = ref.strip().split('#')[0]
    ref = ref.split('?')[0]
    if not ref or ref.startswith(('http','//','data:','mailto:','tel:')): return None
    if ref.startswith('/'): rel = ref[1:]
    else: rel = posixpath.normpath(posixpath.join(posixpath.dirname(arquivo), ref))
    if rel.startswith('..'): return None
    if not re.match(r'^[A-Za-z0-9_\-./]+$', rel): return None
    return rel

def refs_de(texto):
    achado = set()
    for m in re.findall(r'["\'`]((?:\.{1,2}/|/)[A-Za-z0-9_\-./]+)["\'`]', texto): achado.add(m)
    for m in re.findall(r'url\(((?:\.{1,2}/|/)[A-Za-z0-9_\-./]+)\)', texto): achado.add(m)
    return achado

def baixar(alvo, salvar_como=None):
    if alvo in baixados or alvo in falhas: return
    url = BASE + '/' + alvo
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            dados, tipo = r.read(), r.headers.get('content-type', '')
    except Exception as e:
        falhas.add(alvo); print('ERRO', alvo, str(e)[:60]); return
    destino = salvar_como or alvo
    os.makedirs(os.path.dirname(destino) if '/' in destino else '.', exist_ok=True)
    with open(destino, 'wb') as f: f.write(dados)
    baixados.add(alvo); print('OK', destino, len(dados))
    ext = destino.rsplit('.', 1)[-1].lower() if '.' in destino else ''
    if ext in TEXTO or 'html' in tipo:
        try: texto = dados.decode('utf-8')
        except: texto = ''
        for ref in refs_de(texto):
            n = alvo_de(ref, alvo)
            if n:
                if PAGINA_RE.match(n): paginas.add(n)
                else: fila.append(n)

with open('index.html', encoding='utf-8') as f: idx = f.read()
for ref in refs_de(idx):
    n = alvo_de(ref, 'index.html')
    if n:
        if PAGINA_RE.match(n): paginas.add(n)
        else: fila.append(n)

for extra in ['sitemap.xml', 'voz', 'termos', 'sign-up', 'politicos', 'about', 'login', 'monetize', 'afiliado', 'dev-panel', 'affiliate-panel', 'checkout', 'v3', 'indique-ganhe', 'novo', 'recovery', 'politica-de-privacidade']:
    paginas.add(extra)

rodada = 0
while (fila or paginas) and rodada < 15:
    rodada += 1
    lote, fila[:] = list(dict.fromkeys(fila)), []
    print(f'--- rodada {rodada}: {len(lote)} assets + {len(paginas)} paginas')
    for a in lote: baixar(a)
    pgs = list(paginas); paginas.clear()
    for p in pgs: baixar(p, salvar_como=p + '/index.html')

print(f'TOTAL: {len(baixados)} baixados, {len(falhas)} falhas')
if falhas: print('FALHAS:', sorted(falhas)[:50])
