#!/bin/sh
set -e
# Cria o banco na primeira execução (o volume /data guarda os dados entre reinícios).
if [ ! -f "$DATABASE" ]; then
  if [ "$DEMO" = "1" ]; then python init_db.py --demo; else python init_db.py; fi
fi
exec "$@"
