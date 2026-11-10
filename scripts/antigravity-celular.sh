#!/usr/bin/env bash
# SKYNETchat · Antigravity no celular
# Sobe o espelho do OmniAntigravityRemoteChat na mesma máquina onde o
# Antigravity está aberto. O endereço para o celular é impresso no terminal.
#
# uso:  ./scripts/antigravity-celular.sh            (rede local)
#       ./scripts/antigravity-celular.sh publico    (endereço público)
set -euo pipefail

PORTA_CDP="${PORTA_CDP:-7800}"
PORTA_APP="${PORT:-4747}"
MODO="${1:-local}"

falta() { printf '  ✗ %s\n' "$1"; }

echo "· verificando ambiente"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale Node 22 ou superior e rode de novo."
  exit 1
fi
NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node $(node -v) é antigo: o pacote pede 22 ou superior."
  exit 1
fi
echo "  ✓ node $(node -v)"

if ! command -v antigravity >/dev/null 2>&1; then
  falta "comando 'antigravity' não está no PATH"
  echo "    abra o editor manualmente com a porta de depuração:"
  echo "    antigravity . --remote-debugging-port=$PORTA_CDP"
else
  echo "  ✓ antigravity encontrado"
fi

if ! lsof -i ":$PORTA_CDP" >/dev/null 2>&1; then
  echo "  ! nada escutando na porta $PORTA_CDP"
  echo "    em outro terminal rode: antigravity . --remote-debugging-port=$PORTA_CDP"
fi

echo
echo "· subindo o espelho na porta $PORTA_APP"
if [ "$MODO" = "publico" ]; then
  echo "  modo público: o endereço HTTPS aparece abaixo (muda a cada execução)"
  exec env AUTO_TUNNEL_PROVIDER=cloudflare npx --yes omni-antigravity-remote-chat
else
  echo "  modo local: use o endereço da rede que aparecer abaixo, no mesmo Wi-Fi"
  exec npx --yes omni-antigravity-remote-chat
fi
