#!/usr/bin/env bash
# SKYNETchat · publica a função `chat` no Supabase (ativar os eventos canônicos de streaming)
#
# precisa de um token pessoal do Supabase (Account → Access Tokens):
#   export SUPABASE_ACCESS_TOKEN=sbp_...
#   ./scripts/deploy-chat.sh SEU_PROJECT_REF
set -euo pipefail

REF="${1:-${SUPABASE_PROJECT_REF:-}}"
if [ -z "$REF" ]; then
  echo "uso: ./scripts/deploy-chat.sh SEU_PROJECT_REF"
  exit 1
fi
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "falta SUPABASE_ACCESS_TOKEN (Account → Access Tokens no painel do Supabase)"
  exit 1
fi

echo "· conferindo o token"
if ! npx --yes supabase projects list >/dev/null 2>&1; then
  echo "  ✗ o token não foi aceito (ou a rede bloqueou)"
  exit 1
fi
echo "  ✓ token válido"

echo "· publicando a função chat do projeto $REF"
npx --yes supabase functions deploy chat --project-ref "$REF"

echo
echo "✓ publicado. Abra o app e confira: a trilha agora recebe os eventos"
echo "  response.created / output_text.delta / completed direto do servidor."
