#!/usr/bin/env bash
# design-ui skill CLI
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAB="${DESIGN_LAB:-/app/design-lab}"
CMD="${1:-help}"
shift || true

registry_url() {
  case "$1" in
    magicui|magic)            echo "https://magicui.design/r" ;;
    aceternity|ace)           echo "https://ui.aceternity.com/registry" ;;
    motion|motion-primitives) echo "https://motion-primitives.com/c" ;;
    cult|cult-ui)             echo "https://www.cult-ui.com/r" ;;
    hexta|hextaui)            echo "https://hextaui.com/r" ;;
    *)                        echo "" ;;
  esac
}

case "$CMD" in
  help|--help|-h)
    cat <<'TXT'
design-ui

  catalog [filtro]        catálogo de bibliotecas
  taste                   regras de design
  notes                   armadilhas de compatibilidade
  recipes                 composições de layout
  list                    componentes instalados no laboratório
  copy <comp> [destino]   copia componente testado para um projeto
  install <projeto> <lib> <comps...>
                          instala componentes por registry
  lab                     sobe o laboratório em localhost:5173
  lab-build               build + typecheck do laboratório
  verify                  verifica o preview (localhost:4173) com playwright

libs: shadcn | magicui | aceternity | motion | cult | hexta
TXT
    ;;

  catalog)
    if [ $# -gt 0 ]; then
      grep -n -i -A 6 -- "$1" "$SKILL_DIR/references/libraries.md" || echo "nada para '$1'"
    else
      cat "$SKILL_DIR/references/libraries.md"
    fi
    ;;

  taste)   cat "$SKILL_DIR/references/taste.md" ;;
  notes)   cat "$SKILL_DIR/references/porting-notes.md" ;;
  recipes) cat "$SKILL_DIR/references/composition-recipes.md" ;;

  list)
    if [ -d "$LAB/src/components/ui" ]; then
      ls "$LAB/src/components/ui" | sed 's/\.tsx$//' | sort | tr '\n' ' '
      echo
      echo "total: $(ls "$LAB/src/components/ui" | wc -l) componentes"
    else
      echo "laboratório não encontrado em $LAB"
      exit 1
    fi
    ;;

  copy)
    COMP="${1:-}"
    DEST="${2:-./src/components/ui}"
    if [ -z "$COMP" ]; then echo "uso: copy <componente> [destino]"; exit 1; fi
    if [ ! -f "$LAB/src/components/ui/$COMP.tsx" ]; then
      echo "não existe '$COMP' no laboratório. Veja: run_skill design-ui list"
      exit 1
    fi
    mkdir -p "$DEST"
    cp "$LAB/src/components/ui/$COMP.tsx" "$DEST/"
    echo "copiado $COMP.tsx -> $DEST"
    echo "dependências prováveis: motion, cn, lucide-react, next-themes, @radix-ui/*"
    ;;

  install)
    PROJ="${1:-}"; LIB="${2:-}"
    shift 2 2>/dev/null || true
    COMPS=("$@")
    if [ -z "$PROJ" ] || [ -z "$LIB" ] || [ ${#COMPS[@]} -eq 0 ]; then
      echo "uso: install <projeto> <lib> <comp1> <comp2> ..."; exit 1
    fi
    BASE="$(registry_url "$LIB")"
    ARGS=()
    for c in "${COMPS[@]}"; do
      if [ -z "$BASE" ]; then
        ARGS+=("$c")
      else
        ARGS+=("$BASE/$c.json")
      fi
    done
    ( cd "$PROJ" && npx shadcn@latest add -y -o "${ARGS[@]}" )
    ;;

  lab)
    ( cd "$LAB" && npm run dev )
    ;;

  lab-build)
    ( cd "$LAB" && npm run build )
    ;;

  verify)
    ( cd "$LAB" && node verify.mjs )
    ;;

  *)
    echo "comando desconhecido: $CMD (use: run_skill design-ui help)"
    exit 1
    ;;
esac
