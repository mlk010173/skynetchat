#!/usr/bin/env bash
# Confere, em produção, que os cabeçalhos do vercel.json e o rewrite do SPA
# chegaram de verdade. Roda depois de cada deploy (ou no CI, antes de anunciar).
# Uso: scripts/verificar-headers.sh [dominio]
set -u
BASE="${1:-https://skynetchat-xi.vercel.app}"
OBRIGATORIOS=(
  "content-security-policy"
  "x-frame-options"
  "x-content-type-options"
  "referrer-policy"
  "permissions-policy"
  "cross-origin-opener-policy"
)
falhas=0

checar() {
  local url="$1"
  local cab
  cab="$(curl -sI -m 20 "$url")"
  local status
  status="$(printf '%s' "$cab" | head -1 | tr -d '\r')"
  local faltando=()
  for h in "${OBRIGATORIOS[@]}"; do
    printf '%s' "$cab" | grep -qi "^$h:" || faltando+=("$h")
  done
  if [[ "$status" != *" 200"* ]]; then
    echo "FALHA $url -> $status"
    falhas=$((falhas+1))
  elif (( ${#faltando[@]} > 0 )); then
    echo "FALHA $url -> faltam: ${faltando[*]}"
    falhas=$((falhas+1))
  else
    echo "ok    $url"
  fi
}

checar "$BASE/"
checar "$BASE/assets/$(curl -s -m 20 "$BASE/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 | cut -d/ -f2)"
checar "$BASE/chat"        # rewrite do SPA: tem de devolver 200, não 404
checar "$BASE/rota/qualquer" # idem

if (( falhas > 0 )); then
  echo "---"
  echo "$falhas verificacao(oes) falharam. Provavel causa: deploy feito por API"
  echo "(upload somente de arquivos, sem vercel.json). Publique por push no GitHub."
  exit 1
fi
echo "---"
echo "todos os cabecalhos e rewrites presentes em $BASE"
