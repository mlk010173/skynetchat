#!/usr/bin/env python3
"""Ajusta a pasta site/ para ser servida em /skynetchat/ (GitHub Pages de projeto).

O espelho do SKYNETchat foi compilado assumindo a raiz do dominio, entao todo
caminho absoluto ("/_app/...", "/demo/...") precisa ganhar o prefixo do projeto.
Idempotente: rodar duas vezes nao duplica o prefixo.
"""
import os
import re
import sys

RAIZ = sys.argv[1] if len(sys.argv) > 1 else "site"
PREFIXO = "/skynetchat"
EXTENSOES = (".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".map")

# 1) caminhos de modulo do SvelteKit e do demo, em qualquer contexto (aspas, template, import)
MODULO = re.compile(r"(?<!skynetchat)/_app/")
DEMO = re.compile(r"(?<!skynetchat)/demo/")
# 2) atributos src/href que apontam para arquivos na raiz (favicon, manifest...)
ATRIBUTO = re.compile(r'(\s(?:src|href)=")/(?!skynetchat/|/)')

total = arquivos = 0
for pasta, _, nomes in os.walk(RAIZ):
    for nome in nomes:
        if not nome.endswith(EXTENSOES):
            continue
        caminho = os.path.join(pasta, nome)
        try:
            with open(caminho, encoding="utf-8") as f:
                antes = f.read()
        except (UnicodeDecodeError, OSError):
            continue
        depois = MODULO.sub(PREFIXO + "/_app/", antes)
        depois = DEMO.sub(PREFIXO + "/demo/", depois)
        if nome.endswith(".html"):
            depois = ATRIBUTO.sub(r"\g<1>" + PREFIXO + "/", depois)
        if depois != antes:
            with open(caminho, "w", encoding="utf-8") as f:
                f.write(depois)
            arquivos += 1
            total += len(antes) - len(depois) and 1
print(f"preparar-pages: {arquivos} arquivos ajustados para {PREFIXO}/")
