#!/usr/bin/env python3
"""Deixa o espelho (site/) funcionar tanto na raiz (Vercel) quanto em /skynetchat/ (GitHub Pages).

O SvelteKit foi compilado com base "" (raiz do dominio). Aqui cada pagina passa a
calcular a base pelo caminho: /skynetchat quando servida no GitHub Pages, "" na Vercel.
Idsempotente: rodar de novo nao duplica nada.
"""
import os
import re
import sys

RAIZ = sys.argv[1] if len(sys.argv) > 1 else "site"
MARCA = "window.__SKY_BASE"
INJECAO = '<script>window.__SKY_BASE=location.pathname.indexOf("/skynetchat")===0?"/skynetchat":"";</script>'

total = 0
for pasta, _, nomes in os.walk(RAIZ):
    for nome in nomes:
        if not nome.endswith(".html"):
            continue
        caminho = os.path.join(pasta, nome)
        rel = os.path.relpath(pasta, RAIZ)
        nivel = 0 if rel == "." else len(rel.split(os.sep))
        sobe = "../" * nivel
        with open(caminho, encoding="utf-8") as f:
            s = f.read()
        antes = s
        if MARCA not in s:
            s = re.sub(r"(<head[^>]*>)", r"\1" + INJECAO, s, count=1)
        # atributos absolutos viram relativos (mesmo resultado nos dois hosts)
        for atributo in ('href="/_app/', 'src="/_app/', 'href="/demo/', 'src="/demo/'):
            s = s.replace(atributo, atributo.replace('="/', '="' + sobe))
        for estatico in ("favicon-32-v2.png", "favicon-96-v2.png", "apple-touch-icon-v2.png", "manifest-v2.json"):
            s = s.replace('="/' + estatico, '="' + sobe + estatico)
        # js inline: import() de entrada e base do SvelteKit
        s = s.replace('import("/_app/', 'import(' + MARCA + '+"/_app/')
        s = s.replace('base: ""', 'base: ' + MARCA)
        if s != antes:
            with open(caminho, "w", encoding="utf-8") as f:
                f.write(s)
            total += 1
print(f"preparar-pages: {total} paginas ajustadas (base dupla Pages/Vercel)")
