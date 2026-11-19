#!/bin/sh
# Publica uma nova versão do Quórum no servidor compartilhado da VSystems.
#
#   No Mac (pasta do projeto):  ./deploy.sh      -> envia o código por rsync e reconstrói no servidor
#   No servidor (/srv/apps/quorum): ./deploy.sh  -> só reconstrói e reinicia com o código já presente
#
# Os dados (banco, documentos, chave de sessão) ficam no volume Docker "quorum_quorum_dados" e não são afetados.
# O .env do servidor nunca é sobrescrito.
set -eu

SERVIDOR="${SERVIDOR:-administrador@147.135.108.2}"
DESTINO="/srv/apps/quorum"
COMPOSE="docker compose -f docker-compose.servidor.yml"

if [ "$(pwd)" = "$DESTINO" ]; then
  $COMPOSE up -d --build
  docker image prune -f >/dev/null
  sleep 5
  curl -fsS http://127.0.0.1:8102/api/saude && echo
  exit 0
fi

cd "$(dirname "$0")"
rsync -az --delete \
  --exclude '.git/' --exclude 'venv/' --exclude '__pycache__/' --exclude '.pytest_cache/' \
  --exclude 'frontend/node_modules/' --exclude 'frontend/dist/' \
  --exclude 'votacao.db*' --exclude 'instance/' --exclude 'backups/' --exclude 'documentos/' \
  --exclude '.env' --exclude '.DS_Store' \
  ./ "$SERVIDOR:$DESTINO/"
ssh "$SERVIDOR" "cd $DESTINO && sh ./deploy.sh"
