"""Cria uma cópia consistente do banco (pode rodar com o sistema no ar).

Uso:  python backup.py [pasta_destino]
No Docker:  docker compose exec app python backup.py
"""
import os
import sqlite3
import sys

from utils import agora

origem = os.environ.get("DATABASE", os.path.join(os.path.dirname(os.path.abspath(__file__)), "votacao.db"))
pasta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(origem), "backups")
os.makedirs(pasta, exist_ok=True)
destino = os.path.join(pasta, f"votacao-{agora().strftime('%Y%m%d-%H%M%S')}.db")

with sqlite3.connect(origem) as src, sqlite3.connect(destino) as dst:
    src.backup(dst)
print("Backup criado em", destino)
