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
        s = s.replace('"/skynetchat-frontend/', '"' + sobe)
        s = s.replace('skynetchat-frontend/', '')
        for estatico in ("favicon-32-v2.png", "favicon-96-v2.png", "apple-touch-icon-v2.png",
                         "manifest-v2.json", "skynet-logo-vermelha.png", "pwa-icon-any-192-v2.png"):
            s = s.replace('="/' + estatico, '="' + sobe + estatico)
            s = s.replace('": "/' + estatico, '": "' + sobe + estatico)
        # js inline: import() de entrada e base do SvelteKit
        s = s.replace('import("/_app/', 'import(' + MARCA + '+"/_app/')
        s = s.replace('base: ""', 'base: ' + MARCA)
        # cadeia do demo: config -> auth -> mock -> ponte de envio -> guarda
        def injetar_depois(texto, ancora, src):
            if src.split("?")[0] in texto:
                return texto
            alvo = re.search(r'(<script src="[^"]*' + re.escape(ancora) + r'[^"]*"></script>)', texto)
            if not alvo:
                return texto
            return texto.replace(alvo.group(1), alvo.group(1) + '<script src="' + src + '"></script>', 1)

        if "demo/mock.js" in s and "live-config.js" not in s:
            s = re.sub(r'(<script src="[^"]*demo/mock\.js[^"]*"></script>)',
                       r'<script src="' + sobe + r'demo/live-config.js?v=1"></script>'
                       r'<script src="' + sobe + r'demo/live-auth.js?v=1"></script>\1', s, count=1)
            s = injetar_depois(s, "demo/mock.js", sobe + "demo/chat-live.js?v=3")
            s = injetar_depois(s, "demo/chat-live.js", sobe + "demo/guarda.js?v=2")
        elif "demo/mock.js" in s:
            s = injetar_depois(s, "demo/mock.js", sobe + "demo/chat-live.js?v=3")
            s = injetar_depois(s, "demo/chat-live.js", sobe + "demo/guarda.js?v=2")
        if s != antes:
            with open(caminho, "w", encoding="utf-8") as f:
                f.write(s)
            total += 1
print(f"preparar-pages: {total} paginas ajustadas (base dupla Pages/Vercel)")
