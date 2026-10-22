import re, os, ssl, sys, urllib.request, urllib.error
BASE = 'https://skynetchat.net'
CTX = ssl.create_default_context()
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'}
baixados, fila, falhas = set(), [], set()

def norm(ref, de):
    ref = ref.strip()
    if ref.startswith('http') or ref.startswith('//') or ref.startswith('data:'): return None
    if ref.startswith('./'): alvo = ref[2:]
    elif ref.startswith('/'): alvo = ref[1:]
    elif ref.startswith('../'): alvo = ref
    else: alvo = ref
    alvo = alvo.split('#')[0]
    if not alvo or '?' in alvo: alvo = alvo.split('?')[0] or None
    return alvo

def refs_de(texto):
    pats = [r'"(\./[^"]+|/[^"]+)"', r"'\(\s*(\"[^\"\\\\]+\"|'[^']+)'", r"'url\(([^)]+)\)'", r"'(?:src|href)=[\"']([^\"']+)[\"']'"]
    achado = set()
    for p in [r'["\']((?:\./|/)[A-Za-z0-9_\-./]+)["\']', r'url\(((?:\./|/)[A-Za-z0-9_\-./]+)\)']:
        for m in re.findall(p, texto): achado.add(m)
    return achado

def baixar(alvo):
    if alvo in baixados or alvo in falhas: return
    url = BASE + '/' + alvo
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            dados = r.read()
        os.makedirs(os.path.dirname(alvo) if '/' in alvo else '.', exist_ok=True)
        with open(alvo, 'wb') as f: f.write(dados)
        baixados.add(alvo)
        ext = alvo.rsplit('.', 1)[-1].lower() if '.' in alvo else ''
        if ext in ('html', 'js', 'css', 'json', 'svg', 'webmanifest', 'txt', 'mjs'):
            try: texto = dados.decode('utf-8')
            except: texto = ''
            for ref in refs_de(texto):
                n = norm(ref, alvo)
                if n: fila.append(n)
        print('OK', alvo, len(dados))
    except Exception as e:
        falhas.add(alvo)
        print('ERRO', alvo, str(e)[:80])

# semente: tudo do index.html
with open('index.html', encoding='utf-8') as f: idx = f.read()
for ref in refs_de(idx):
    n = norm(ref, 'index.html')
    if n: fila.append(n)
# comuns da raiz
for extra in ['manifest-v2.json', 'favicon-32-v2.png', 'favicon-96-v2.png', 'apple-touch-icon-v2.png', 'skynet-logo-vermelha.png', 'robots.txt', 'sitemap.xml']:
    fila.append(extra)

rodada = 0
while fila and rodada < 12:
    rodada += 1
    lote = list(dict.fromkeys(fila)); fila.clear()
    print(f'--- rodada {rodada}: {len(lote)} arquivos')
    for a in lote: baixar(a)

print(f'TOTAL: {len(baixados)} baixados, {len(falhas)} falhas')
if falhas: print('FALHAS:', sorted(falhas)[:40])
