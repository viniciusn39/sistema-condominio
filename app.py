"""Sistema de votações do condomínio — API JSON (Flask + SQLite) que também serve o frontend React."""
import csv
import io
import os
import secrets
import sqlite3
import time
from collections import defaultdict, deque
from datetime import timedelta
from functools import wraps

from flask import Flask, Response, abort, g, jsonify, request, send_from_directory, session
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

import importacao
from apuracao import MAIORIAS, apurar
from ata import gerar_ata
from utils import (FMT, UFS, agora, agora_registro, cnpj_valido, cpf_valido, email_valido, formata_cpf,
                   para_datetime, so_digitos)

BASE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(BASE, "frontend", "dist")


def _carrega_secret_key():
    """Usa SECRET_KEY do ambiente; senão gera uma chave aleatória e guarda em instance/secret_key."""
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    caminho = os.environ.get("SECRET_KEY_FILE", os.path.join(BASE, "instance", "secret_key"))
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    try:
        fd = os.open(caminho, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_hex(32))
    except FileExistsError:
        pass
    with open(caminho, encoding="utf-8") as f:
        return f.read().strip()


app = Flask(__name__, static_folder=None)
if os.environ.get("ATRAS_DE_PROXY") == "1":
    # atrás do Caddy/Nginx: usa o IP real do cliente (limite de tentativas de login) e o esquema https
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config.update(
    SECRET_KEY=_carrega_secret_key(),
    DATABASE=os.environ.get("DATABASE", os.path.join(BASE, "votacao.db")),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE") == "1",  # ligue quando estiver em HTTPS
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
    CSRF_ENABLED=True,
    JSON_SORT_KEYS=False,
)

NOME_CONDOMINIO = os.environ.get("CONDOMINIO_NOME", "").strip()
PRODUTO = "Quórum"
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # uploads de planilha e documentos em PDF
ROTULOS = {"agendada": "Agendada", "aberta": "Aberta", "encerrada": "Encerrada"}
SENHA_MINIMA = 8


class ErroValidacao(Exception):
    """Erro de regra de negócio: vira um JSON {"erro": ...} com status 400 (ou outro)."""

    def __init__(self, mensagem, status=400):
        super().__init__(mensagem)
        self.mensagem, self.status = mensagem, status


def ok(mensagem=None, **dados):
    if mensagem:
        dados["mensagem"] = mensagem
    return jsonify(dados)


# ---------- Banco de dados ----------
_migrados = set()


def _migra(db):
    """Atualiza bancos criados por versões anteriores do sistema."""
    def colunas(tabela):
        return {r[1] for r in db.execute(f"PRAGMA table_info({tabela})")}
    if "ativo" not in colunas("usuarios"):
        db.execute("ALTER TABLE usuarios ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1")
    if "encerrada_em" not in colunas("votacoes"):
        db.execute("ALTER TABLE votacoes ADD COLUMN encerrada_em TEXT")
    if "quorum_minimo" not in colunas("votacoes"):
        db.execute("ALTER TABLE votacoes ADD COLUMN quorum_minimo INTEGER NOT NULL DEFAULT 0")
        db.execute("ALTER TABLE votacoes ADD COLUMN maioria TEXT NOT NULL DEFAULT 'simples'")
    if "fundamento" not in colunas("votacoes"):
        db.execute("ALTER TABLE votacoes ADD COLUMN fundamento TEXT")
    for coluna in ("ultimo_acesso", "telefone", "termos_em", "criado_em"):
        if coluna not in colunas("usuarios"):
            db.execute(f"ALTER TABLE usuarios ADD COLUMN {coluna} TEXT")
    if "vaga" not in colunas("unidades"):
        db.execute("ALTER TABLE unidades ADD COLUMN vaga INTEGER NOT NULL DEFAULT 0")
    db.commit()
    # tabelas novas (condomínios, avisos etc.): o schema só usa CREATE ... IF NOT EXISTS
    with open(os.path.join(BASE, "schema.sql"), encoding="utf-8") as f:
        db.executescript(f.read())
    if "condominio_id" not in colunas("unidades"):
        _migra_para_condominios(db, colunas)
    for tabela in ("unidades", "votacoes", "avisos", "documentos"):
        db.execute(f"CREATE INDEX IF NOT EXISTS ix_{tabela}_condominio ON {tabela} (condominio_id)")
    db.execute("CREATE INDEX IF NOT EXISTS ix_membros_usuario ON membros (usuario_id)")
    db.commit()
    db.execute("PRAGMA journal_mode = WAL")  # leituras não bloqueiam durante gravações


def _migra_para_condominios(db, colunas):
    """Banco de um condomínio só (versões anteriores) -> tudo passa a pertencer ao primeiro condomínio."""
    db.execute("PRAGMA foreign_keys = OFF")
    try:
        agora_ = agora_registro()
        cid = db.execute("INSERT INTO condominios (nome, convite_token, criado_em) VALUES (?,?,?)",
                         (NOME_CONDOMINIO or "Meu condomínio", secrets.token_urlsafe(12), agora_)).lastrowid
        for tabela in ("votacoes", "avisos", "documentos"):
            if "condominio_id" not in colunas(tabela):
                db.execute(f"ALTER TABLE {tabela} ADD COLUMN condominio_id INTEGER REFERENCES condominios(id)")
            db.execute(f"UPDATE {tabela} SET condominio_id = ? WHERE condominio_id IS NULL", (cid,))
        # unidades: a chave única passa a ser (condomínio, bloco, número) -> recria a tabela mantendo os ids
        db.execute("""CREATE TABLE unidades_nova (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          condominio_id INTEGER NOT NULL REFERENCES condominios(id),
                          bloco TEXT NOT NULL, numero TEXT NOT NULL, vaga INTEGER NOT NULL DEFAULT 0,
                          UNIQUE (condominio_id, bloco, numero))""")
        db.execute("INSERT INTO unidades_nova (id, condominio_id, bloco, numero, vaga) "
                   "SELECT id, ?, bloco, numero, vaga FROM unidades", (cid,))
        db.execute("DROP TABLE unidades")
        db.execute("ALTER TABLE unidades_nova RENAME TO unidades")
        db.execute("""INSERT INTO membros (condominio_id, usuario_id, papel, ativo, desde)
                      SELECT ?, id, CASE perfil WHEN 'admin' THEN 'sindico' ELSE 'morador' END, ativo, ?
                      FROM usuarios""", (cid, agora_))
        db.execute("UPDATE usuarios SET ativo = 1")   # desativar agora é por condomínio (membros.ativo)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.execute("PRAGMA foreign_keys = ON")


def get_db():
    if "db" not in g:
        caminho = app.config["DATABASE"]
        if not os.path.exists(caminho):
            raise RuntimeError("Banco de dados não encontrado. Rode primeiro: python init_db.py --demo")
        db = sqlite3.connect(caminho, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        if caminho not in _migrados:
            _migra(db)
            _migrados.add(caminho)
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def conta(sql, params=()):
    return get_db().execute(sql, params).fetchone()[0]


def dados_json():
    return request.get_json(silent=True) or {}


def inteiro(valor):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


# ---------- Datas e estado das votações ----------
def estado(v):
    """A votação abre e encerra sozinha pelos horários; o síndico pode encerrar antes."""
    if v["encerrada_em"]:
        return "encerrada"
    n = agora()
    if n < para_datetime(v["data_inicio"]):
        return "agendada"
    if n >= para_datetime(v["data_fim"]):
        return "encerrada"
    return "aberta"


def segundos_para(texto):
    return max(0, int((para_datetime(texto) - agora()).total_seconds()))


def formata(texto):
    if not texto:
        return ""
    try:
        return para_datetime(texto).strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return texto


def votacao_json(v):
    st = estado(v)
    d = {k: v[k] for k in ("id", "titulo", "descricao", "data_inicio", "data_fim", "encerrada_em",
                           "quorum_minimo", "maioria", "fundamento")}
    d["estado"] = st
    # segundos até a próxima mudança de estado (abrir/encerrar) — o frontend faz a contagem regressiva
    d["segundos"] = (segundos_para(v["data_fim"]) if st == "aberta"
                     else segundos_para(v["data_inicio"]) if st == "agendada" else None)
    for extra in ("total_votos", "meus_votos"):
        if extra in v.keys():
            d[extra] = v[extra]
    return d


# ---------- CSRF ----------
def csrf_token():
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_urlsafe(32)
    return session["_csrf"]


@app.before_request
def protege_csrf():
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and app.config["CSRF_ENABLED"]:
        esperado = session.get("_csrf")
        if not esperado or not secrets.compare_digest(esperado, request.headers.get("X-CSRF-Token", "")):
            raise ErroValidacao("Sessão expirada. Recarregue a página e tente de novo.", 403)


# ---------- Sessão e permissões ----------
def _meus_condominios(uid):
    return get_db().execute(
        """SELECT c.id, c.nome, c.cidade, c.uf, m.papel FROM membros m JOIN condominios c ON c.id = m.condominio_id
           WHERE m.usuario_id = ? AND m.ativo = 1 ORDER BY m.papel = 'sindico' DESC, c.nome""", (uid,)).fetchall()


@app.before_request
def carrega_usuario():
    g.user = g.condo = g.papel = None
    g.cid = None
    if not request.path.startswith("/api/"):
        return
    uid = session.get("uid")
    if not uid:
        return
    g.user = get_db().execute("SELECT * FROM usuarios WHERE id = ? AND ativo = 1", (uid,)).fetchone()
    if g.user is None:
        session.pop("uid", None)
        return
    # condomínio atual: o escolhido na sessão, se a pessoa ainda participa dele; senão o primeiro da lista
    meus = _meus_condominios(uid)
    atual = next((c for c in meus if c["id"] == session.get("cid")), meus[0] if meus else None)
    if atual:
        g.cid, g.papel = atual["id"], atual["papel"]
        g.condo = get_db().execute("SELECT * FROM condominios WHERE id = ?", (g.cid,)).fetchone()
        session["cid"] = g.cid
    else:
        session.pop("cid", None)


def usuario_json(u):
    # "perfil" é o papel no condomínio atual: admin = síndico
    return {"id": u["id"], "nome": u["nome"], "email": u["email"],
            "perfil": "admin" if g.get("papel") == "sindico" else "votante"}


def eh_sindico():
    return g.papel == "sindico"


def login_required(f):
    @wraps(f)
    def wrapper(*a, **kw):
        if g.user is None:
            raise ErroValidacao("Faça login para continuar.", 401)
        return f(*a, **kw)
    return wrapper


def condominio_required(f):
    """Rotas de dados: exigem login e um condomínio atual."""
    @wraps(f)
    @login_required
    def wrapper(*a, **kw):
        if g.cid is None:
            raise ErroValidacao("Você ainda não participa de nenhum condomínio.", 409)
        return f(*a, **kw)
    return wrapper


def admin_required(f):
    @wraps(f)
    @condominio_required
    def wrapper(*a, **kw):
        if not eh_sindico():
            raise ErroValidacao("Acesso restrito ao síndico.", 403)
        return f(*a, **kw)
    return wrapper


def total_unidades():
    return conta("SELECT COUNT(*) FROM unidades WHERE condominio_id = ?", (g.cid,))


# ---------- Autenticação ----------
_falhas_login = defaultdict(deque)
MAX_FALHAS, JANELA_FALHAS = 5, 600   # 5 erros em 10 minutos bloqueiam o IP temporariamente
_HASH_FALSO = generate_password_hash(secrets.token_hex(8))


def _login_bloqueado(ip):
    fila, t = _falhas_login[ip], time.time()
    while fila and t - fila[0] > JANELA_FALHAS:
        fila.popleft()
    return len(fila) >= MAX_FALHAS


@app.get("/api/saude")
def api_saude():
    """Usado pelo healthcheck do Docker."""
    conta("SELECT 1")
    return ok(status="ok")


CAMPOS_CONDOMINIO = ("id", "nome", "cnpj", "tipo", "cep", "logradouro", "numero", "complemento", "bairro", "cidade",
                     "uf", "n_blocos", "n_unidades", "telefone", "email", "administradora")


def _sessao_json():
    if not g.user:
        return {"usuario": None, "csrf": csrf_token(), "condominio": "", "condominio_atual": None, "condominios": []}
    return {"usuario": usuario_json(g.user), "csrf": csrf_token(),
            "condominio": g.condo["nome"] if g.condo else "",
            "condominio_atual": {k: g.condo[k] for k in ("id", "nome", "cidade", "uf")} if g.condo else None,
            "condominios": [dict(c) for c in _meus_condominios(g.user["id"])]}


@app.get("/api/sessao")
def api_sessao():
    return ok(**_sessao_json())


@app.post("/api/login")
def api_login():
    ip = request.remote_addr or "?"
    if _login_bloqueado(ip):
        raise ErroValidacao("Muitas tentativas erradas. Aguarde alguns minutos e tente de novo.", 429)
    d = dados_json()
    email = str(d.get("email", "")).strip().lower()
    senha = str(d.get("senha", ""))
    u = get_db().execute("SELECT * FROM usuarios WHERE email = ? AND ativo = 1", (email,)).fetchone()
    if u and check_password_hash(u["senha_hash"], senha):
        _falhas_login.pop(ip, None)
        session.clear()
        session.permanent = True
        session["uid"] = u["id"]
        db = get_db()
        db.execute("UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?", (agora_registro(), u["id"]))
        db.commit()
        carrega_usuario()
        return ok(**_sessao_json())
    if u is None:
        check_password_hash(_HASH_FALSO, senha)  # mesmo tempo de resposta com ou sem usuário
    _falhas_login[ip].append(time.time())
    raise ErroValidacao("E-mail ou senha incorretos.", 401)


@app.post("/api/logout")
def api_logout():
    session.clear()
    return ok(csrf=csrf_token())


@app.post("/api/conta/senha")
@login_required
def api_trocar_senha():
    d = dados_json()
    nova = str(d.get("nova", ""))
    if not check_password_hash(g.user["senha_hash"], str(d.get("atual", ""))):
        raise ErroValidacao("A senha atual está incorreta.")
    if len(nova) < SENHA_MINIMA:
        raise ErroValidacao(f"A nova senha deve ter pelo menos {SENHA_MINIMA} caracteres.")
    if nova != d.get("confirmacao"):
        raise ErroValidacao("A confirmação não confere com a nova senha.")
    db = get_db()
    db.execute("UPDATE usuarios SET senha_hash = ? WHERE id = ?", (generate_password_hash(nova), g.user["id"]))
    db.commit()
    return ok("Senha alterada.")


# ---------- Cadastro do síndico e dos condomínios ----------
_cadastros_ip = defaultdict(deque)
MAX_CADASTROS, JANELA_CADASTROS = 5, 3600   # até 5 cadastros por hora por IP
TIPOS_CONDOMINIO = ("residencial", "comercial", "misto")
TIPOS_SINDICO = ("morador", "profissional", "empresa")


def _texto(d, campo, rotulo, maximo, obrigatorio=True):
    valor = str(d.get(campo) or "").strip()
    if obrigatorio and not valor:
        raise ErroValidacao(f"Informe {rotulo}.")
    if len(valor) > maximo:
        raise ErroValidacao(f"{rotulo[0].upper() + rotulo[1:]}: no máximo {maximo} caracteres.")
    return valor or None


def _telefone(d, campo, obrigatorio):
    tel = so_digitos(str(d.get(campo) or ""))
    if not tel and not obrigatorio:
        return None
    if len(tel) not in (10, 11):
        raise ErroValidacao("Telefone inválido: use DDD + número (10 ou 11 dígitos).")
    return tel


def _inteiro_faixa(d, campo, rotulo, maximo):
    if d.get(campo) in (None, ""):
        return None
    n = inteiro(d.get(campo))
    if n is None or not 1 <= n <= maximo:
        raise ErroValidacao(f"{rotulo} deve ser um número entre 1 e {maximo}.")
    return n


def _le_condominio(d, cid_atual=None):
    c = {
        "nome": _texto(d, "nome", "o nome do condomínio", 150),
        "tipo": d.get("tipo") or "residencial",
        "cep": so_digitos(str(d.get("cep") or "")),
        "logradouro": _texto(d, "logradouro", "o logradouro (rua, avenida...)", 150),
        "numero": _texto(d, "numero", "o número do endereço", 20),
        "complemento": _texto(d, "complemento", "o complemento", 80, obrigatorio=False),
        "bairro": _texto(d, "bairro", "o bairro", 80),
        "cidade": _texto(d, "cidade", "a cidade", 80),
        "uf": str(d.get("uf") or "").strip().upper(),
        "n_blocos": _inteiro_faixa(d, "n_blocos", "O número de blocos", 200),
        "n_unidades": _inteiro_faixa(d, "n_unidades", "O número de unidades", 20000),
        "telefone": _telefone(d, "telefone", obrigatorio=False),
        "email": str(d.get("email") or "").strip().lower() or None,
        "administradora": _texto(d, "administradora", "a administradora", 120, obrigatorio=False),
        "cnpj": so_digitos(str(d.get("cnpj") or "")) or None,
    }
    if c["tipo"] not in TIPOS_CONDOMINIO:
        raise ErroValidacao("Tipo de condomínio inválido.")
    if len(c["cep"]) != 8:
        raise ErroValidacao("CEP inválido: são 8 dígitos.")
    if c["uf"] not in UFS:
        raise ErroValidacao("Escolha o estado (UF).")
    if c["email"] and not email_valido(c["email"]):
        raise ErroValidacao("E-mail da administração inválido.")
    if c["cnpj"]:
        if not cnpj_valido(c["cnpj"]):
            raise ErroValidacao("CNPJ do condomínio inválido. Confira os números ou deixe em branco.")
        outro = get_db().execute("SELECT id FROM condominios WHERE cnpj = ?", (c["cnpj"],)).fetchone()
        if outro and outro["id"] != cid_atual:
            raise ErroValidacao("Já existe um condomínio cadastrado com este CNPJ. Fale com o síndico atual "
                                "para ser incluído nele.", 409)
    return c


def _le_mandato(d):
    m = {"sindico_tipo": d.get("sindico_tipo") or "morador", "empresa_nome": None, "empresa_cnpj": None}
    if m["sindico_tipo"] not in TIPOS_SINDICO:
        raise ErroValidacao("Tipo de síndico inválido.")
    if m["sindico_tipo"] == "empresa":
        m["empresa_nome"] = _texto(d, "empresa_nome", "a razão social da empresa", 150)
        m["empresa_cnpj"] = so_digitos(str(d.get("empresa_cnpj") or ""))
        if not cnpj_valido(m["empresa_cnpj"]):
            raise ErroValidacao("CNPJ da empresa de sindicatura inválido.")
    try:
        inicio = para_datetime(str(d.get("mandato_inicio") or ""))
        fim = para_datetime(str(d.get("mandato_fim") or ""))
    except ValueError:
        raise ErroValidacao("Informe o início e o fim do mandato, conforme a ata da eleição.")
    if fim <= inicio:
        raise ErroValidacao("O fim do mandato deve ser depois do início.")
    if (fim - inicio).days > 2 * 366:
        raise ErroValidacao("O mandato do síndico é de no máximo 2 anos (art. 1.347 do Código Civil). "
                            "Em caso de reeleição, cadastre o novo período.")
    m["mandato_inicio"], m["mandato_fim"] = inicio.strftime("%Y-%m-%d"), fim.strftime("%Y-%m-%d")
    return m


def _cria_condominio(db, c, m, uid):
    cid = db.execute(
        f"""INSERT INTO condominios ({", ".join(c)}, convite_token, criado_em, criado_por)
            VALUES ({", ".join("?" * len(c))}, ?, ?, ?)""",
        (*c.values(), secrets.token_urlsafe(12), agora_registro(), uid)).lastrowid
    db.execute(f"""INSERT INTO membros (condominio_id, usuario_id, papel, desde, {", ".join(m)})
                   VALUES (?, ?, 'sindico', ?, {", ".join("?" * len(m))})""",
               (cid, uid, agora_registro(), *m.values()))
    return cid


@app.post("/api/cadastro")
def api_cadastro():
    """Cadastro público do síndico, já com o primeiro condomínio. Ao terminar, a pessoa entra no sistema."""
    if g.user:
        raise ErroValidacao("Você já está conectado. Para cadastrar outro condomínio, use o menu do sistema.", 409)
    ip = request.remote_addr or "?"
    fila, t = _cadastros_ip[ip], time.time()
    while fila and t - fila[0] > JANELA_CADASTROS:
        fila.popleft()
    if len(fila) >= MAX_CADASTROS:
        raise ErroValidacao("Muitos cadastros a partir desta conexão. Tente de novo mais tarde.", 429)
    d = dados_json()
    s_, cd = d.get("sindico") or {}, d.get("condominio") or {}
    sindico = _le_usuario({**s_, "perfil": "admin"}, exige_senha=True)
    if sindico["senha"] != s_.get("confirmacao"):
        raise ErroValidacao("A confirmação não confere com a senha.")
    telefone = _telefone(s_, "telefone", obrigatorio=True)
    mandato = _le_mandato(s_)
    condo = _le_condominio(cd)
    if d.get("aceite") is not True:
        raise ErroValidacao("Para continuar, aceite o tratamento dos dados para a gestão do condomínio.")
    db = get_db()
    if db.execute("SELECT 1 FROM usuarios WHERE email = ? OR cpf = ?", (sindico["email"], sindico["cpf"])).fetchone():
        raise ErroValidacao("Já existe uma conta com este e-mail ou CPF. Entre com ela e cadastre o condomínio "
                            "pelo menu “Cadastrar outro condomínio”.", 409)
    try:
        uid = db.execute("""INSERT INTO usuarios (nome, cpf, email, senha_hash, telefone, termos_em, criado_em,
                            ultimo_acesso) VALUES (?,?,?,?,?,?,?,?)""",
                         (sindico["nome"], sindico["cpf"], sindico["email"], generate_password_hash(sindico["senha"]),
                          telefone, agora_registro(), agora_registro(), agora_registro())).lastrowid
        cid = _cria_condominio(db, condo, mandato, uid)
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ErroValidacao("Não foi possível concluir: e-mail, CPF ou CNPJ já cadastrado.", 409)
    fila.append(t)
    session.clear()
    session.permanent = True
    session["uid"], session["cid"] = uid, cid
    carrega_usuario()
    return ok(f"Bem-vindo(a)! O {condo['nome']} foi cadastrado.", **_sessao_json()), 201


@app.post("/api/condominios")
@login_required
def api_criar_condominio():
    """Quem já tem conta cadastra mais um condomínio (passa a ser síndico dele)."""
    d = dados_json()
    condo, mandato = _le_condominio(d.get("condominio") or {}), _le_mandato(d.get("mandato") or {})
    db = get_db()
    try:
        cid = _cria_condominio(db, condo, mandato, g.user["id"])
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ErroValidacao("Já existe um condomínio com este CNPJ.", 409)
    session["cid"] = cid
    carrega_usuario()
    return ok(f"{condo['nome']} cadastrado. Você é o síndico.", **_sessao_json()), 201


@app.post("/api/condominios/<int:cid>/entrar")
@login_required
def api_trocar_condominio(cid):
    if not any(c["id"] == cid for c in _meus_condominios(g.user["id"])):
        raise ErroValidacao("Você não participa deste condomínio.", 403)
    session["cid"] = cid
    carrega_usuario()
    return ok(**_sessao_json())


@app.get("/api/admin/condominio")
@admin_required
def api_dados_condominio():
    m = get_db().execute("SELECT * FROM membros WHERE condominio_id = ? AND usuario_id = ?",
                         (g.cid, g.user["id"])).fetchone()
    return ok(condominio={k: g.condo[k] for k in CAMPOS_CONDOMINIO},
              mandato={k: m[k] for k in ("sindico_tipo", "empresa_nome", "empresa_cnpj", "mandato_inicio",
                                         "mandato_fim")},
              sindicos=[dict(r) for r in get_db().execute(
                  """SELECT us.nome, us.email, m.mandato_inicio, m.mandato_fim FROM membros m
                     JOIN usuarios us ON us.id = m.usuario_id
                     WHERE m.condominio_id = ? AND m.papel = 'sindico' AND m.ativo = 1 ORDER BY us.nome""", (g.cid,))])


@app.put("/api/admin/condominio")
@admin_required
def api_salvar_condominio():
    d = dados_json()
    condo = _le_condominio(d.get("condominio") or {}, cid_atual=g.cid)
    mandato = _le_mandato(d.get("mandato") or {})
    db = get_db()
    try:
        db.execute(f"UPDATE condominios SET {', '.join(f'{k} = ?' for k in condo)} WHERE id = ?",
                   (*condo.values(), g.cid))
        db.execute(f"UPDATE membros SET {', '.join(f'{k} = ?' for k in mandato)} "
                   "WHERE condominio_id = ? AND usuario_id = ?", (*mandato.values(), g.cid, g.user["id"]))
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ErroValidacao("Já existe um condomínio com este CNPJ.", 409)
    return ok("Dados do condomínio salvos.")


@app.get("/api/conta")
@login_required
def api_conta():
    u = g.user
    return ok(conta={"nome": u["nome"], "email": u["email"], "cpf": formata_cpf(u["cpf"]), "telefone": u["telefone"]})


@app.put("/api/conta")
@login_required
def api_salvar_conta():
    d = dados_json()
    nome = _texto(d, "nome", "o seu nome", 120)
    telefone = _telefone(d, "telefone", obrigatorio=False)
    db = get_db()
    db.execute("UPDATE usuarios SET nome = ?, telefone = ? WHERE id = ?", (nome, telefone, g.user["id"]))
    db.commit()
    return ok("Seus dados foram atualizados.")


# ---------- Votações (moradores) ----------
@app.get("/api/votacoes")
@condominio_required
def api_votacoes():
    uid = g.user["id"]
    votacoes = get_db().execute(
        """SELECT v.*,
                  (SELECT COUNT(*) FROM votos WHERE votacao_id = v.id) AS total_votos,
                  (SELECT COUNT(*) FROM votos vt
                     JOIN autorizacoes_voto a ON a.unidade_id = vt.unidade_id AND a.ativo = 1
                    WHERE vt.votacao_id = v.id AND a.usuario_id = ?) AS meus_votos
           FROM votacoes v WHERE v.condominio_id = ? ORDER BY v.data_fim DESC""", (uid, g.cid)).fetchall()
    total = total_unidades()
    return ok(
        votacoes=[votacao_json(v) for v in votacoes],
        n_unidades=conta("""SELECT COUNT(*) FROM autorizacoes_voto a JOIN unidades un ON un.id = a.unidade_id
                            WHERE a.usuario_id = ? AND a.ativo = 1 AND un.condominio_id = ?""", (uid, g.cid)),
        total_unidades=total,
        painel=_painel_votacoes(votacoes, uid, total))


def _painel_votacoes(votacoes, uid, total_unidades):
    """Indicadores do condomínio para o painel da página de votações."""
    encerradas = [v for v in votacoes if estado(v) == "encerrada"]
    votei = {r[0] for r in get_db().execute("SELECT DISTINCT votacao_id FROM votos WHERE usuario_id = ?", (uid,))}
    apuradas = [(v, _resultado_apurado(v)) for v in encerradas]
    ultima = max(apuradas, key=lambda par: par[0]["encerrada_em"] or par[0]["data_fim"], default=None)
    return {
        "encerradas": len(encerradas),
        "participei": sum(1 for v in encerradas if v["id"] in votei),
        "participacao_media": round(sum(100 * v["total_votos"] / total_unidades for v in encerradas) / len(encerradas), 1)
                              if encerradas and total_unidades else None,
        "decididas": sum(1 for _, r in apuradas if r["apuracao"]["situacao"] == "decidida"),
        "ultima": {"id": ultima[0]["id"], "titulo": ultima[0]["titulo"], "data_fim": ultima[0]["encerrada_em"] or ultima[0]["data_fim"],
                   "resultado": ultima[1]} if ultima else None,
    }


def _busca_votacao(vid):
    v = get_db().execute("SELECT * FROM votacoes WHERE id = ? AND condominio_id = ?", (vid, g.cid)).fetchone()
    if v is None:
        raise ErroValidacao("Votação não encontrada.", 404)
    return v


def _resultado(vid):
    linhas = get_db().execute(
        """SELECT o.id, o.texto, COUNT(vt.id) AS total FROM opcoes o
           LEFT JOIN votos vt ON vt.opcao_id = o.id
           WHERE o.votacao_id = ? GROUP BY o.id ORDER BY o.id""", (vid,)).fetchall()
    total = sum(r["total"] for r in linhas)
    maximo = max((r["total"] for r in linhas), default=0)
    itens = [{"texto": r["texto"], "total": r["total"],
              "pct": round(100 * r["total"] / total, 1) if total else 0,
              "lider": maximo > 0 and r["total"] == maximo} for r in linhas]
    return {"itens": itens, "total": total, "lideres": [i["texto"] for i in itens if i["lider"]]}


def _resultado_apurado(v):
    res = _resultado(v["id"])
    res["apuracao"] = apurar(v, res, total_unidades(), estado(v) == "encerrada")
    return res


ORDEM_UNIDADE = "un.bloco, CAST(un.numero AS INTEGER), un.numero"


def _votos_nominais(vid):
    return get_db().execute(
        f"""SELECT un.id AS unidade_id, un.bloco, un.numero, un.vaga, us.nome, o.id AS opcao_id, o.texto AS opcao, vt.data_hora
            FROM votos vt JOIN unidades un ON un.id = vt.unidade_id
            JOIN usuarios us ON us.id = vt.usuario_id
            JOIN opcoes o ON o.id = vt.opcao_id
            WHERE vt.votacao_id = ? ORDER BY {ORDEM_UNIDADE}""", (vid,)).fetchall()


@app.get("/api/votacoes/<int:vid>")
@condominio_required
def api_votacao(vid):
    db, v = get_db(), _busca_votacao(vid)
    st = estado(v)
    admin = eh_sindico()
    opcoes = db.execute("SELECT id, texto FROM opcoes WHERE votacao_id = ? ORDER BY id", (vid,)).fetchall()
    minhas = db.execute(
        f"""SELECT un.id, un.bloco, un.numero,
                   (SELECT opcao_id FROM votos WHERE votacao_id = ? AND unidade_id = un.id) AS opcao_votada
            FROM autorizacoes_voto a JOIN unidades un ON un.id = a.unidade_id
            WHERE a.usuario_id = ? AND a.ativo = 1 AND un.condominio_id = ?
            ORDER BY {ORDEM_UNIDADE}""", (vid, g.user["id"], g.cid)).fetchall()
    total_votos = conta("SELECT COUNT(*) FROM votos WHERE votacao_id = ?", (vid,))
    resposta = {
        "votacao": votacao_json(v),
        "opcoes": [dict(o) for o in opcoes],
        "minhas": [dict(m) for m in minhas],
        "resultado": _resultado_apurado(v) if st == "encerrada" or admin else None,
        "total_votos": total_votos,
        "total_unidades": total_unidades(),
    }
    if admin:
        resposta["nominal"] = [dict(n) for n in _votos_nominais(vid)]
        resposta["pendentes"] = [dict(p) for p in _pendentes(vid)]
        resposta["pode_editar"] = st != "encerrada" and total_votos == 0
    return ok(**resposta)


@app.post("/api/votacoes/<int:vid>/votar")
@condominio_required
def api_votar(vid):
    db, v = get_db(), _busca_votacao(vid)
    if estado(v) != "aberta":
        raise ErroValidacao("Esta votação não está aberta.")
    d = dados_json()
    unidade_id, opcao_id = inteiro(d.get("unidade_id")), inteiro(d.get("opcao_id"))
    if not db.execute("""SELECT 1 FROM autorizacoes_voto a JOIN unidades un ON un.id = a.unidade_id
                         WHERE a.unidade_id = ? AND a.usuario_id = ? AND a.ativo = 1 AND un.condominio_id = ?""",
                      (unidade_id, g.user["id"], g.cid)).fetchone():
        raise ErroValidacao("Você não é o votante autorizado desta unidade.", 403)
    if not db.execute("SELECT 1 FROM opcoes WHERE id = ? AND votacao_id = ?", (opcao_id, vid)).fetchone():
        raise ErroValidacao("Escolha uma opção válida.")
    try:
        db.execute("INSERT INTO votos (votacao_id, unidade_id, usuario_id, opcao_id, data_hora) VALUES (?,?,?,?,?)",
                   (vid, unidade_id, g.user["id"], opcao_id, agora_registro()))
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ErroValidacao("Esta unidade já votou nesta votação.", 409)
    return ok("Voto registrado com sucesso.")


# ---------- Administração: votações ----------
@app.get("/api/admin/resumo")
@admin_required
def api_admin_resumo():
    votacoes = get_db().execute(
        """SELECT v.*, (SELECT COUNT(*) FROM votos WHERE votacao_id = v.id) AS total_votos
           FROM votacoes v WHERE v.condominio_id = ? ORDER BY v.data_fim DESC""", (g.cid,)).fetchall()
    lista = [votacao_json(v) for v in votacoes]
    ordem = {"aberta": 0, "agendada": 1, "encerrada": 2}
    lista.sort(key=lambda v: ordem[v["estado"]])
    return ok(votacoes=lista, stats={
        "abertas": sum(1 for v in lista if v["estado"] == "aberta"),
        "unidades": total_unidades(),
        "moradores": conta("SELECT COUNT(*) FROM membros WHERE condominio_id = ? AND ativo = 1", (g.cid,)),
        "sem_votante": conta("""SELECT COUNT(*) FROM unidades WHERE condominio_id = ? AND id NOT IN
                                (SELECT unidade_id FROM autorizacoes_voto WHERE ativo = 1)""", (g.cid,)),
    })


def _le_votacao(d):
    titulo = str(d.get("titulo", "")).strip()
    descricao = str(d.get("descricao", "")).strip()
    brutas = d.get("opcoes", [])
    if isinstance(brutas, str):
        brutas = brutas.splitlines()
    opcoes = list(dict.fromkeys(str(o).strip() for o in brutas if str(o).strip()))
    if not titulo:
        raise ErroValidacao("Informe o título da pauta.")
    if len(titulo) > 150:
        raise ErroValidacao("O título deve ter no máximo 150 caracteres.")
    if len(opcoes) < 2:
        raise ErroValidacao("Informe pelo menos duas opções diferentes.")
    if len(opcoes) > 20 or any(len(o) > 100 for o in opcoes):
        raise ErroValidacao("Use no máximo 20 opções, com até 100 caracteres cada.")
    try:
        inicio = para_datetime(str(d.get("data_inicio", "")))
        fim = para_datetime(str(d.get("data_fim", "")))
    except ValueError:
        raise ErroValidacao("Preencha as datas de abertura e encerramento.")
    if fim <= inicio:
        raise ErroValidacao("O encerramento deve ser depois da abertura.")
    if fim <= agora():
        raise ErroValidacao("O encerramento precisa ser no futuro.")
    quorum = inteiro(d.get("quorum_minimo") or 0)
    if quorum is None or not 0 <= quorum <= 100:
        raise ErroValidacao("O quórum mínimo deve ser um percentual entre 0 e 100.")
    maioria = d.get("maioria") or "simples"
    if maioria not in MAIORIAS:
        raise ErroValidacao("Tipo de maioria inválido.")
    fundamento = str(d.get("fundamento") or "").strip()[:200]
    return {"titulo": titulo, "descricao": descricao, "opcoes": opcoes, "quorum_minimo": quorum, "maioria": maioria,
            "fundamento": fundamento,
            "data_inicio": inicio.strftime(FMT), "data_fim": fim.strftime(FMT)}


def _salva_opcoes(db, vid, opcoes):
    db.executemany("INSERT INTO opcoes (votacao_id, texto) VALUES (?,?)", [(vid, o) for o in opcoes])


@app.post("/api/admin/votacoes")
@admin_required
def api_criar_votacao():
    dados = _le_votacao(dados_json())
    db = get_db()
    cur = db.execute("INSERT INTO votacoes (condominio_id, titulo, descricao, data_inicio, data_fim, quorum_minimo, "
                     "maioria, fundamento) VALUES (?,?,?,?,?,?,?,?)",
                     (g.cid, dados["titulo"], dados["descricao"], dados["data_inicio"], dados["data_fim"],
                      dados["quorum_minimo"], dados["maioria"], dados["fundamento"]))
    _salva_opcoes(db, cur.lastrowid, dados["opcoes"])
    db.commit()
    return ok("Votação criada. Ela abre e encerra automaticamente nos horários definidos.", id=cur.lastrowid), 201


@app.put("/api/admin/votacoes/<int:vid>")
@admin_required
def api_editar_votacao(vid):
    db, v = get_db(), _busca_votacao(vid)
    if estado(v) == "encerrada" or conta("SELECT COUNT(*) FROM votos WHERE votacao_id = ?", (vid,)):
        raise ErroValidacao("Só é possível editar votações que ainda não receberam votos.", 409)
    dados = _le_votacao(dados_json())
    try:
        db.execute("UPDATE votacoes SET titulo = ?, descricao = ?, data_inicio = ?, data_fim = ?, quorum_minimo = ?, "
                   "maioria = ?, fundamento = ? WHERE id = ?",
                   (dados["titulo"], dados["descricao"], dados["data_inicio"], dados["data_fim"],
                    dados["quorum_minimo"], dados["maioria"], dados["fundamento"], vid))
        db.execute("DELETE FROM opcoes WHERE votacao_id = ?", (vid,))
        _salva_opcoes(db, vid, dados["opcoes"])
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ErroValidacao("Não foi possível editar: alguém votou enquanto você editava.", 409)
    return ok("Votação atualizada.")


@app.post("/api/admin/votacoes/<int:vid>/encerrar")
@admin_required
def api_encerrar_votacao(vid):
    db, v = get_db(), _busca_votacao(vid)
    if estado(v) != "aberta":
        raise ErroValidacao("Só é possível encerrar uma votação que está aberta.", 409)
    db.execute("UPDATE votacoes SET encerrada_em = ? WHERE id = ?", (agora_registro(), vid))
    db.commit()
    return ok("Votação encerrada. O resultado já está disponível para todos.")


@app.delete("/api/admin/votacoes/<int:vid>")
@admin_required
def api_excluir_votacao(vid):
    db = get_db()
    _busca_votacao(vid)
    if conta("SELECT COUNT(*) FROM votos WHERE votacao_id = ?", (vid,)):
        raise ErroValidacao("Votações que já receberam votos não podem ser excluídas.", 409)
    db.execute("DELETE FROM opcoes WHERE votacao_id = ?", (vid,))
    db.execute("DELETE FROM votacoes WHERE id = ?", (vid,))
    db.commit()
    return ok("Votação excluída.")


def _celula_csv(valor):
    """Evita que planilhas interpretem textos como fórmulas."""
    valor = "" if valor is None else str(valor)
    return "'" + valor if valor[:1] in ("=", "+", "-", "@", "\t", "\r") else valor


@app.get("/api/admin/votacoes/<int:vid>/votos.csv")
@admin_required
def api_exportar_csv(vid):
    v = _busca_votacao(vid)
    res = _resultado(vid)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")

    def linha(*cols):
        w.writerow([_celula_csv(c) for c in cols])

    linha("Votação", v["titulo"])
    linha("Período", f"{formata(v['data_inicio'])} a {formata(v['data_fim'])}")
    linha("Situação", ROTULOS[estado(v)])
    linha("Unidades que votaram", f"{res['total']} de {total_unidades()}")
    linha("Apuração", apurar(v, res, total_unidades(), estado(v) == "encerrada")["texto"])
    linha()
    linha("Opção", "Votos", "%")
    for i in res["itens"]:
        linha(i["texto"], i["total"], str(i["pct"]).replace(".", ","))
    linha()
    linha("Unidade", "Votante", "Opção", "Data e hora")
    for n in _votos_nominais(vid):
        linha(f"{n['bloco']}-{n['numero']}", n["nome"], n["opcao"], formata(n["data_hora"]))
    return Response("﻿" + buf.getvalue(), mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="votacao-{vid}.csv"'})


def _pendentes(vid):
    return get_db().execute(
        f"""SELECT un.id AS unidade_id, un.bloco, un.numero, un.vaga, us.nome AS votante FROM unidades un
            LEFT JOIN autorizacoes_voto a ON a.unidade_id = un.id AND a.ativo = 1
            LEFT JOIN usuarios us ON us.id = a.usuario_id
            WHERE un.condominio_id = ? AND un.id NOT IN (SELECT unidade_id FROM votos WHERE votacao_id = ?)
            ORDER BY {ORDEM_UNIDADE}""", (g.cid, vid)).fetchall()


@app.get("/api/admin/votacoes/<int:vid>/ata.pdf")
@admin_required
def api_ata_pdf(vid):
    v = _busca_votacao(vid)
    res = _resultado_apurado(v)
    encerramento = None
    if v["encerrada_em"]:
        encerramento = f"Encerrada antecipadamente pelo síndico em {formata(v['encerrada_em'])}"
    elif estado(v) == "encerrada":
        encerramento = f"Encerrada automaticamente em {formata(v['data_fim'])}"
    nominal = [{**dict(n), "data_hora_fmt": formata(n["data_hora"])} for n in _votos_nominais(vid)]
    pdf = gerar_ata(
        condominio=g.condo["nome"], votacao=v, resultado=res, apuracao=res["apuracao"], nominal=nominal,
        periodo=f"De {formata(v['data_inicio'])} a {formata(v['data_fim'])} (horário de Brasília)",
        encerramento=encerramento, pendentes=[dict(p) for p in _pendentes(vid)],
        total_unidades=total_unidades(),
        gerado_em=agora().strftime("%d/%m/%Y às %H:%M"), produto=PRODUTO)
    disposicao = "attachment" if request.args.get("baixar") else "inline"
    return Response(pdf, mimetype="application/pdf",
                    headers={"Content-Disposition": f'{disposicao}; filename="ata-votacao-{vid}.pdf"'})


# ---------- Documentos do condomínio ----------
CATEGORIAS_DOC = {"convencao": "Convenção", "regimento": "Regimento interno", "ata": "Atas",
                  "financeiro": "Prestação de contas", "contrato": "Contratos", "outro": "Outros"}


def _pasta_documentos():
    pasta = os.path.join(os.path.dirname(os.path.abspath(app.config["DATABASE"])), "documentos")
    os.makedirs(pasta, exist_ok=True)
    return pasta


def _busca_documento(did):
    d = get_db().execute("SELECT * FROM documentos WHERE id = ? AND condominio_id = ?", (did, g.cid)).fetchone()
    if d is None:
        raise ErroValidacao("Documento não encontrado.", 404)
    return d


@app.get("/api/documentos")
@condominio_required
def api_documentos():
    db = get_db()
    docs = db.execute("""SELECT d.id, d.titulo, d.categoria, d.descricao, d.nome_original, d.tamanho, d.enviado_em,
                                us.nome AS enviado_por
                         FROM documentos d JOIN usuarios us ON us.id = d.enviado_por
                         WHERE d.condominio_id = ? ORDER BY d.enviado_em DESC""", (g.cid,)).fetchall()
    resposta = {"documentos": [dict(d) for d in docs], "categorias": CATEGORIAS_DOC}
    if eh_sindico():
        # atas geradas pelo sistema (com votos nominais, por isso só para o síndico)
        resposta["atas_sistema"] = [
            {"id": v["id"], "titulo": v["titulo"], "data_fim": v["encerrada_em"] or v["data_fim"]}
            for v in db.execute("SELECT * FROM votacoes WHERE condominio_id = ? ORDER BY data_fim DESC", (g.cid,))
            if estado(v) == "encerrada"]
    return ok(**resposta)


@app.get("/api/documentos/<int:did>/arquivo")
@condominio_required
def api_documento_arquivo(did):
    d = _busca_documento(did)
    resp = send_from_directory(_pasta_documentos(), d["arquivo"], mimetype="application/pdf",
                               as_attachment=bool(request.args.get("baixar")), download_name=d["nome_original"])
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


def _le_documento(form):
    titulo = str(form.get("titulo", "")).strip()
    categoria = form.get("categoria") or "outro"
    descricao = str(form.get("descricao", "")).strip()
    if not titulo or len(titulo) > 150:
        raise ErroValidacao("Informe um título de até 150 caracteres.")
    if categoria not in CATEGORIAS_DOC:
        raise ErroValidacao("Categoria inválida.")
    if len(descricao) > 500:
        raise ErroValidacao("A descrição deve ter até 500 caracteres.")
    return titulo, categoria, descricao


@app.post("/api/admin/documentos")
@admin_required
def api_enviar_documento():
    titulo, categoria, descricao = _le_documento(request.form)
    arquivo = request.files.get("arquivo")
    if arquivo is None or not arquivo.filename:
        raise ErroValidacao("Escolha o arquivo PDF.")
    conteudo = arquivo.read()
    if not conteudo.startswith(b"%PDF"):
        raise ErroValidacao("Envie o documento em PDF.")
    nome = secrets.token_hex(16) + ".pdf"
    with open(os.path.join(_pasta_documentos(), nome), "wb") as f:
        f.write(conteudo)
    original = os.path.basename(arquivo.filename.replace("\\", "/"))[:150] or "documento.pdf"
    if not original.lower().endswith(".pdf"):
        original += ".pdf"
    db = get_db()
    cur = db.execute("""INSERT INTO documentos (condominio_id, titulo, categoria, descricao, arquivo, nome_original,
                        tamanho, enviado_por, enviado_em) VALUES (?,?,?,?,?,?,?,?,?)""",
                     (g.cid, titulo, categoria, descricao, nome, original, len(conteudo), g.user["id"], agora_registro()))
    db.commit()
    return ok("Documento publicado. Os moradores já podem consultar.", id=cur.lastrowid), 201


@app.put("/api/admin/documentos/<int:did>")
@admin_required
def api_editar_documento(did):
    _busca_documento(did)
    titulo, categoria, descricao = _le_documento(dados_json())
    db = get_db()
    db.execute("UPDATE documentos SET titulo = ?, categoria = ?, descricao = ? WHERE id = ?",
               (titulo, categoria, descricao, did))
    db.commit()
    return ok("Documento atualizado.")


@app.delete("/api/admin/documentos/<int:did>")
@admin_required
def api_excluir_documento(did):
    d = _busca_documento(did)
    db = get_db()
    db.execute("DELETE FROM documentos WHERE id = ?", (did,))
    db.commit()
    try:
        os.remove(os.path.join(_pasta_documentos(), d["arquivo"]))
    except FileNotFoundError:
        pass
    return ok("Documento excluído.")


# ---------- Mural de avisos ----------
CATEGORIAS = {"geral": "Geral", "manutencao": "Manutenção", "assembleia": "Assembleia",
              "seguranca": "Segurança", "financeiro": "Financeiro", "obras": "Obras"}


def _avisos_nao_lidos(uid):
    # o próprio autor nunca tem o aviso como "não lido"
    return conta("""SELECT COUNT(*) FROM avisos a WHERE a.condominio_id = ? AND a.autor_id != ? AND NOT EXISTS
                    (SELECT 1 FROM avisos_lidos l WHERE l.aviso_id = a.id AND l.usuario_id = ?)""", (g.cid, uid, uid))


@app.get("/api/avisos")
@condominio_required
def api_avisos():
    db, uid = get_db(), g.user["id"]
    admin = eh_sindico()
    total_membros = conta("SELECT COUNT(*) FROM membros WHERE condominio_id = ? AND ativo = 1", (g.cid,))
    avisos = db.execute(
        """SELECT a.*, us.nome AS autor,
                  (SELECT lido_em FROM avisos_lidos WHERE aviso_id = a.id AND usuario_id = ?) AS lido_em,
                  (SELECT COUNT(*) FROM avisos_lidos l JOIN membros m ON m.usuario_id = l.usuario_id
                    WHERE l.aviso_id = a.id AND m.condominio_id = a.condominio_id AND m.ativo = 1
                      AND l.usuario_id != a.autor_id) AS leituras,
                  (SELECT COUNT(*) FROM membros m WHERE m.condominio_id = a.condominio_id AND m.ativo = 1
                      AND m.usuario_id = a.autor_id) AS autor_membro
           FROM avisos a JOIN usuarios us ON us.id = a.autor_id
           WHERE a.condominio_id = ?
           ORDER BY a.fixado DESC, a.criado_em DESC""", (uid, g.cid)).fetchall()
    lista = []
    for a in avisos:
        item = {k: a[k] for k in ("id", "titulo", "texto", "categoria", "criado_em", "editado_em", "autor")}
        item.update(fixado=bool(a["fixado"]), lido=a["lido_em"] is not None or a["autor_id"] == uid)
        if admin:
            # quem publicou não conta: o aviso é para os outros
            item.update(leituras=a["leituras"], total_moradores=total_membros - a["autor_membro"],
                        quem_viu=[r[0] for r in db.execute(
                            """SELECT us.nome FROM avisos_lidos l JOIN usuarios us ON us.id = l.usuario_id
                               JOIN membros m ON m.usuario_id = us.id AND m.condominio_id = ? AND m.ativo = 1
                               WHERE l.aviso_id = ? AND l.usuario_id != ? ORDER BY l.lido_em LIMIT 5""",
                            (g.cid, a["id"], a["autor_id"]))])
        lista.append(item)
    return ok(avisos=lista, nao_lidos=sum(1 for i in lista if not i["lido"]), categorias=CATEGORIAS)


@app.get("/api/avisos/nao-lidos")
@condominio_required
def api_avisos_nao_lidos():
    return ok(nao_lidos=_avisos_nao_lidos(g.user["id"]))


@app.post("/api/avisos/lidos")
@condominio_required
def api_marcar_avisos_lidos():
    db = get_db()
    db.execute("""INSERT OR IGNORE INTO avisos_lidos (aviso_id, usuario_id, lido_em)
                  SELECT id, ?, ? FROM avisos WHERE condominio_id = ?""", (g.user["id"], agora_registro(), g.cid))
    db.commit()
    return ok()


@app.post("/api/avisos/<int:aid>/lido")
@condominio_required
def api_marcar_aviso_lido(aid):
    """Chamado quando o aviso aparece de fato na tela do morador."""
    _busca_aviso(aid)
    db = get_db()
    db.execute("INSERT OR IGNORE INTO avisos_lidos (aviso_id, usuario_id, lido_em) VALUES (?,?,?)",
               (aid, g.user["id"], agora_registro()))
    db.commit()
    return ok(nao_lidos=_avisos_nao_lidos(g.user["id"]))


UNIDADES_DO_MEMBRO = """(SELECT GROUP_CONCAT(DISTINCT un.bloco || '-' || un.numero) FROM unidades un
                          WHERE un.condominio_id = m.condominio_id AND un.id IN (
                            SELECT unidade_id FROM proprietarios WHERE usuario_id = us.id
                            UNION SELECT unidade_id FROM autorizacoes_voto WHERE usuario_id = us.id AND ativo = 1))"""


@app.get("/api/admin/avisos/<int:aid>/leituras")
@admin_required
def api_leituras_aviso(aid):
    db = get_db()
    aviso = _busca_aviso(aid)
    lidos = db.execute(f"""SELECT us.nome, l.lido_em, {UNIDADES_DO_MEMBRO} AS unidades
                           FROM avisos_lidos l JOIN usuarios us ON us.id = l.usuario_id
                           JOIN membros m ON m.usuario_id = us.id AND m.condominio_id = ? AND m.ativo = 1
                           WHERE l.aviso_id = ? AND us.id != ? ORDER BY l.lido_em""",
                       (g.cid, aid, aviso["autor_id"])).fetchall()
    nao = db.execute(f"""SELECT us.nome, us.ultimo_acesso, {UNIDADES_DO_MEMBRO} AS unidades
                         FROM membros m JOIN usuarios us ON us.id = m.usuario_id
                         WHERE m.condominio_id = ? AND m.ativo = 1 AND us.id != ? AND us.id NOT IN
                         (SELECT usuario_id FROM avisos_lidos WHERE aviso_id = ?) ORDER BY us.nome""",
                     (g.cid, aviso["autor_id"], aid)).fetchall()
    return ok(lidos=[dict(r) for r in lidos], nao_lidos=[dict(r) for r in nao])


def _busca_aviso(aid):
    a = get_db().execute("SELECT * FROM avisos WHERE id = ? AND condominio_id = ?", (aid, g.cid)).fetchone()
    if a is None:
        raise ErroValidacao("Aviso não encontrado.", 404)
    return a


def _le_aviso(d):
    titulo, texto = str(d.get("titulo", "")).strip(), str(d.get("texto", "")).strip()
    categoria = d.get("categoria") or "geral"
    if not titulo or len(titulo) > 120:
        raise ErroValidacao("Informe um título de até 120 caracteres.")
    if not texto or len(texto) > 5000:
        raise ErroValidacao("Escreva o texto do aviso (até 5.000 caracteres).")
    if categoria not in CATEGORIAS:
        raise ErroValidacao("Categoria inválida.")
    return titulo, texto, categoria, 1 if d.get("fixado") else 0


@app.post("/api/admin/avisos")
@admin_required
def api_criar_aviso():
    titulo, texto, categoria, fixado = _le_aviso(dados_json())
    db = get_db()
    cur = db.execute("INSERT INTO avisos (condominio_id, titulo, texto, categoria, fixado, autor_id, criado_em) "
                     "VALUES (?,?,?,?,?,?,?)", (g.cid, titulo, texto, categoria, fixado, g.user["id"], agora_registro()))
    # quem publica já leu
    db.execute("INSERT INTO avisos_lidos (aviso_id, usuario_id, lido_em) VALUES (?,?,?)",
               (cur.lastrowid, g.user["id"], agora_registro()))
    db.commit()
    return ok("Aviso publicado no mural.", id=cur.lastrowid), 201


@app.put("/api/admin/avisos/<int:aid>")
@admin_required
def api_editar_aviso(aid):
    titulo, texto, categoria, fixado = _le_aviso(dados_json())
    db = get_db()
    _busca_aviso(aid)
    db.execute("UPDATE avisos SET titulo = ?, texto = ?, categoria = ?, fixado = ?, editado_em = ? WHERE id = ?",
               (titulo, texto, categoria, fixado, agora_registro(), aid))
    db.commit()
    return ok("Aviso atualizado.")


@app.post("/api/admin/avisos/<int:aid>/fixar")
@admin_required
def api_fixar_aviso(aid):
    db = get_db()
    a = _busca_aviso(aid)
    db.execute("UPDATE avisos SET fixado = ? WHERE id = ?", (0 if a["fixado"] else 1, aid))
    db.commit()
    return ok("Aviso desafixado." if a["fixado"] else "Aviso fixado no topo do mural.")


@app.delete("/api/admin/avisos/<int:aid>")
@admin_required
def api_excluir_aviso(aid):
    db = get_db()
    _busca_aviso(aid)
    db.execute("DELETE FROM avisos_lidos WHERE aviso_id = ?", (aid,))
    db.execute("DELETE FROM avisos WHERE id = ?", (aid,))
    db.commit()
    return ok("Aviso excluído.")


# ---------- Importação de planilha ----------
@app.get("/api/admin/importar/modelo.csv")
@admin_required
def api_modelo_importacao():
    buf = io.StringIO()
    csv.writer(buf, delimiter=";").writerows(importacao.MODELO)
    return Response("\ufeff" + buf.getvalue(), mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="modelo-importacao.csv"'})


@app.post("/api/admin/importar")
@admin_required
def api_importar():
    arquivo = request.files.get("arquivo")
    if arquivo is None or not arquivo.filename:
        raise ErroValidacao("Escolha um arquivo .csv ou .xlsx.")
    try:
        registros = importacao.ler_planilha(arquivo.filename, arquivo.read())
    except importacao.ErroPlanilha as e:
        raise ErroValidacao(str(e))
    db = get_db()
    linhas, publico, resumo = importacao.planejar(db, registros, g.cid)
    if request.form.get("confirmar") != "1":
        return ok(linhas=publico, resumo=resumo)
    if resumo["erros"]:
        raise ErroValidacao("Corrija as linhas com erro antes de importar.")

    def define_votante(db_, unidade_id, usuario_id, tipo):
        atual = db_.execute("SELECT usuario_id FROM autorizacoes_voto WHERE unidade_id = ? AND ativo = 1",
                            (unidade_id,)).fetchone()
        if not atual or atual["usuario_id"] != usuario_id:
            _define_votante(db_, unidade_id, usuario_id, tipo)

    try:
        credenciais = importacao.executar(db, linhas, define_votante, g.cid)
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ErroValidacao("Os dados mudaram durante a importação. Simule de novo e confirme.", 409)
    return ok(f"Importação concluída: {resumo['unidades_novas']} unidade(s) e {resumo['moradores_novos']} "
              "morador(es) novos.", resumo=resumo, credenciais=credenciais)


# ---------- Administração: moradores ----------
@app.get("/api/admin/moradores")
@admin_required
def api_moradores():
    usuarios = get_db().execute(
        """SELECT us.id, us.nome, us.email, us.cpf, us.telefone, us.ultimo_acesso,
                  CASE m.papel WHEN 'sindico' THEN 'admin' ELSE 'votante' END AS perfil, m.ativo,
                  (SELECT GROUP_CONCAT(un.bloco || '-' || un.numero, ', ') FROM proprietarios p
                     JOIN unidades un ON un.id = p.unidade_id
                    WHERE p.usuario_id = us.id AND un.condominio_id = m.condominio_id) AS proprias,
                  (SELECT GROUP_CONCAT(un.bloco || '-' || un.numero, ', ') FROM autorizacoes_voto a
                     JOIN unidades un ON un.id = a.unidade_id
                    WHERE a.usuario_id = us.id AND a.ativo = 1 AND un.condominio_id = m.condominio_id) AS vota_por
           FROM membros m JOIN usuarios us ON us.id = m.usuario_id
           WHERE m.condominio_id = ? ORDER BY m.ativo DESC, us.nome""", (g.cid,)).fetchall()
    return ok(moradores=[{**dict(u), "ativo": bool(u["ativo"]), "cpf": formata_cpf(u["cpf"])} for u in usuarios])


def _le_usuario(d, exige_senha):
    dados = {"nome": str(d.get("nome", "")).strip(), "email": str(d.get("email", "")).strip().lower(),
             "cpf": so_digitos(str(d.get("cpf", ""))), "perfil": d.get("perfil", "votante")}
    if not dados["nome"] or len(dados["nome"]) > 120:
        raise ErroValidacao("Informe o nome (até 120 caracteres).")
    if not email_valido(dados["email"]):
        raise ErroValidacao("Informe um e-mail válido.")
    if not cpf_valido(dados["cpf"]):
        raise ErroValidacao("CPF inválido.")
    if dados["perfil"] not in ("admin", "votante"):
        raise ErroValidacao("Perfil inválido.")
    if exige_senha:
        dados["senha"] = str(d.get("senha", ""))
        if len(dados["senha"]) < SENHA_MINIMA:
            raise ErroValidacao(f"A senha deve ter pelo menos {SENHA_MINIMA} caracteres.")
    return dados


def _membro(uid):
    """Usuário que participa (ativo ou não) do condomínio atual."""
    u = get_db().execute("""SELECT us.*, m.papel, m.ativo AS membro_ativo FROM membros m
                            JOIN usuarios us ON us.id = m.usuario_id
                            WHERE m.condominio_id = ? AND m.usuario_id = ?""", (g.cid, uid)).fetchone()
    if u is None:
        raise ErroValidacao("Morador não encontrado.", 404)
    return u


def _membro_ativo(uid):
    return get_db().execute("""SELECT us.* FROM membros m JOIN usuarios us ON us.id = m.usuario_id
                               WHERE m.condominio_id = ? AND m.usuario_id = ? AND m.ativo = 1""",
                            (g.cid, uid)).fetchone()


def _participa_de_outros(uid):
    return conta("SELECT COUNT(*) FROM membros WHERE usuario_id = ? AND condominio_id != ?", (uid, g.cid)) > 0


@app.post("/api/admin/moradores")
@admin_required
def api_criar_morador():
    dados = _le_usuario(dados_json(), exige_senha=True)
    papel = "sindico" if dados["perfil"] == "admin" else "morador"
    db = get_db()
    existente = db.execute("SELECT * FROM usuarios WHERE email = ? OR cpf = ?", (dados["email"], dados["cpf"])).fetchone()
    if existente:
        # a pessoa já usa o sistema em outro condomínio: só é incluída aqui se e-mail e CPF baterem
        if (existente["email"], existente["cpf"]) != (dados["email"], dados["cpf"]):
            raise ErroValidacao("Já existe um usuário com este e-mail ou CPF.", 409)
        if db.execute("SELECT 1 FROM membros WHERE condominio_id = ? AND usuario_id = ?",
                      (g.cid, existente["id"])).fetchone():
            raise ErroValidacao("Essa pessoa já está cadastrada neste condomínio.", 409)
        db.execute("INSERT INTO membros (condominio_id, usuario_id, papel, desde) VALUES (?,?,?,?)",
                   (g.cid, existente["id"], papel, agora_registro()))
        db.commit()
        return ok(f"{existente['nome']} já tinha conta no {PRODUTO} e foi incluído(a) neste condomínio. "
                  "Ela continua entrando com a senha que já usa.", id=existente["id"]), 201
    cur = db.execute("INSERT INTO usuarios (nome, cpf, email, senha_hash, criado_em) VALUES (?,?,?,?,?)",
                     (dados["nome"], dados["cpf"], dados["email"], generate_password_hash(dados["senha"]),
                      agora_registro()))
    db.execute("INSERT INTO membros (condominio_id, usuario_id, papel, desde) VALUES (?,?,?,?)",
               (g.cid, cur.lastrowid, papel, agora_registro()))
    db.commit()
    return ok(f"{dados['nome']} cadastrado(a). Agora vincule a pessoa a uma unidade.", id=cur.lastrowid), 201


@app.put("/api/admin/moradores/<int:uid>")
@admin_required
def api_editar_morador(uid):
    u = _membro(uid)
    dados = _le_usuario(dados_json(), exige_senha=False)
    if uid == g.user["id"] and dados["perfil"] != "admin":
        raise ErroValidacao("Você não pode remover o seu próprio acesso de síndico.")
    mudou_pessoais = (dados["nome"], dados["email"], dados["cpf"]) != (u["nome"], u["email"], u["cpf"])
    if mudou_pessoais and uid != g.user["id"] and _participa_de_outros(uid):
        raise ErroValidacao("Essa pessoa também participa de outro condomínio. Nome, e-mail e CPF só podem "
                            "ser alterados por ela mesma.", 403)
    db = get_db()
    try:
        db.execute("UPDATE usuarios SET nome = ?, email = ?, cpf = ? WHERE id = ?",
                   (dados["nome"], dados["email"], dados["cpf"], uid))
        db.execute("UPDATE membros SET papel = ? WHERE condominio_id = ? AND usuario_id = ?",
                   ("sindico" if dados["perfil"] == "admin" else "morador", g.cid, uid))
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ErroValidacao("Já existe outro usuário com este e-mail ou CPF.", 409)
    return ok("Dados atualizados.")


@app.post("/api/admin/moradores/<int:uid>/senha")
@admin_required
def api_redefinir_senha(uid):
    u = _membro(uid)
    if uid != g.user["id"] and _participa_de_outros(uid):
        raise ErroValidacao("Essa pessoa também participa de outro condomínio, então só ela pode trocar a própria "
                            "senha.", 403)
    senha = str(dados_json().get("senha", ""))
    if len(senha) < SENHA_MINIMA:
        raise ErroValidacao(f"A senha deve ter pelo menos {SENHA_MINIMA} caracteres.")
    db = get_db()
    db.execute("UPDATE usuarios SET senha_hash = ? WHERE id = ?", (generate_password_hash(senha), uid))
    db.commit()
    return ok(f"Senha de {u['nome']} redefinida.")


@app.post("/api/admin/moradores/<int:uid>/ativo")
@admin_required
def api_alterna_morador(uid):
    u = _membro(uid)
    if uid == g.user["id"]:
        raise ErroValidacao("Você não pode desativar o seu próprio acesso.")
    db = get_db()
    if u["membro_ativo"]:
        db.execute("UPDATE membros SET ativo = 0 WHERE condominio_id = ? AND usuario_id = ?", (g.cid, uid))
        n = db.execute("""UPDATE autorizacoes_voto SET ativo = 0, data_fim = ?
                          WHERE usuario_id = ? AND ativo = 1
                            AND unidade_id IN (SELECT id FROM unidades WHERE condominio_id = ?)""",
                       (agora_registro(), uid, g.cid)).rowcount
        msg = f"Acesso de {u['nome']} desativado."
        if n:
            msg += f" {n} unidade(s) ficaram sem votante — defina um novo em Unidades."
    else:
        db.execute("UPDATE membros SET ativo = 1 WHERE condominio_id = ? AND usuario_id = ?", (g.cid, uid))
        msg = f"Acesso de {u['nome']} reativado."
    db.commit()
    return ok(msg)


# ---------- Administração: unidades ----------
@app.get("/api/admin/unidades")
@admin_required
def api_unidades():
    db = get_db()
    donos = defaultdict(list)
    for r in db.execute("""SELECT p.unidade_id, us.id, us.nome FROM proprietarios p
                           JOIN usuarios us ON us.id = p.usuario_id JOIN unidades un ON un.id = p.unidade_id
                           WHERE un.condominio_id = ? ORDER BY us.nome""", (g.cid,)):
        donos[r["unidade_id"]].append({"id": r["id"], "nome": r["nome"]})
    votantes = {r["unidade_id"]: {"nome": r["nome"], "tipo": r["tipo"], "indicado_por": r["indicado_por"]}
                for r in db.execute(
                    """SELECT a.unidade_id, a.tipo, us.nome, ind.nome AS indicado_por FROM autorizacoes_voto a
                       JOIN usuarios us ON us.id = a.usuario_id
                       LEFT JOIN usuarios ind ON ind.id = a.indicado_por JOIN unidades un ON un.id = a.unidade_id
                       WHERE a.ativo = 1 AND un.condominio_id = ?""", (g.cid,))}
    unidades = db.execute(f"SELECT * FROM unidades un WHERE un.condominio_id = ? ORDER BY {ORDEM_UNIDADE}",
                          (g.cid,)).fetchall()
    return ok(
        unidades=[{**dict(u), "proprietarios": donos.get(u["id"], []), "votante": votantes.get(u["id"])}
                  for u in unidades],
        moradores=[dict(u) for u in db.execute(
            """SELECT us.id, us.nome FROM membros m JOIN usuarios us ON us.id = m.usuario_id
               WHERE m.condominio_id = ? AND m.ativo = 1 ORDER BY us.nome""", (g.cid,))])


def _busca_unidade(unid):
    u = get_db().execute("SELECT * FROM unidades WHERE id = ? AND condominio_id = ?", (unid, g.cid)).fetchone()
    if u is None:
        raise ErroValidacao("Unidade não encontrada.", 404)
    return u


def _define_votante(db, unidade_id, usuario_id, tipo, indicado_por=None):
    db.execute("UPDATE autorizacoes_voto SET ativo = 0, data_fim = ? WHERE unidade_id = ? AND ativo = 1",
               (agora_registro(), unidade_id))
    db.execute("INSERT INTO autorizacoes_voto (unidade_id, usuario_id, tipo, indicado_por, data_inicio) "
               "VALUES (?,?,?,?,?)", (unidade_id, usuario_id, tipo, indicado_por, agora_registro()))


# ---------- Administração: mapa do condomínio ----------
def _situacao_unidade(vaga, donos, votante):
    if vaga:
        return "vaga"
    if votante:
        return "ativa" if votante["ultimo_acesso"] else "nunca_acessou"
    return "sem_votante" if donos else "sem_cadastro"


@app.get("/api/admin/mapa")
@admin_required
def api_mapa():
    """Situação de cadastro de cada unidade, para o desenho dos prédios."""
    db = get_db()
    donos = defaultdict(list)
    for r in db.execute("""SELECT p.unidade_id, us.nome, us.email, us.ultimo_acesso FROM proprietarios p
                           JOIN usuarios us ON us.id = p.usuario_id JOIN unidades un ON un.id = p.unidade_id
                           WHERE un.condominio_id = ? ORDER BY us.nome""", (g.cid,)):
        donos[r["unidade_id"]].append({"nome": r["nome"], "email": r["email"], "ultimo_acesso": r["ultimo_acesso"]})
    votantes = {r["unidade_id"]: dict(r) for r in db.execute(
        """SELECT a.unidade_id, a.tipo, us.nome, us.email, us.ultimo_acesso FROM autorizacoes_voto a
           JOIN usuarios us ON us.id = a.usuario_id JOIN unidades un ON un.id = a.unidade_id
           WHERE a.ativo = 1 AND un.condominio_id = ?""", (g.cid,))}
    ultima = db.execute("""SELECT id, titulo FROM votacoes WHERE condominio_id = ? AND data_inicio <= ?
                           ORDER BY data_inicio DESC LIMIT 1""", (g.cid, agora().strftime(FMT))).fetchone()
    votaram = {r[0] for r in db.execute("SELECT unidade_id FROM votos WHERE votacao_id = ?", (ultima["id"],))} \
        if ultima else set()
    unidades = []
    for u in db.execute(f"SELECT * FROM unidades un WHERE un.condominio_id = ? ORDER BY {ORDEM_UNIDADE}", (g.cid,)):
        v = votantes.get(u["id"])
        if v:
            v.pop("unidade_id", None)
        unidades.append({"id": u["id"], "bloco": u["bloco"], "numero": u["numero"], "vaga": bool(u["vaga"]),
                         "situacao": _situacao_unidade(u["vaga"], donos.get(u["id"]), v),
                         "proprietarios": donos.get(u["id"], []), "votante": v,
                         "votou_ultima": u["id"] in votaram})
    return ok(unidades=unidades, ultima_votacao=dict(ultima) if ultima else None)


@app.put("/api/admin/unidades/<int:unid>/vaga")
@admin_required
def api_marcar_vaga(unid):
    un = _busca_unidade(unid)
    vaga = bool(dados_json().get("vaga"))
    db = get_db()
    db.execute("UPDATE unidades SET vaga = ? WHERE id = ?", (int(vaga), unid))
    db.commit()
    nome = f"{un['bloco']}-{un['numero']}"
    return ok(f"Unidade {nome} marcada como vaga." if vaga else f"Unidade {nome} marcada como ocupada.")


@app.post("/api/admin/unidades")
@admin_required
def api_criar_unidade():
    d = dados_json()
    bloco = str(d.get("bloco", "")).strip().upper()
    numero = str(d.get("numero", "")).strip()
    if not bloco or not numero or len(bloco) > 10 or len(numero) > 10:
        raise ErroValidacao("Informe o bloco e o número do apartamento (até 10 caracteres cada).")
    db = get_db()
    try:
        db.execute("INSERT INTO unidades (condominio_id, bloco, numero) VALUES (?,?,?)", (g.cid, bloco, numero))
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ErroValidacao(f"A unidade {bloco}-{numero} já existe.", 409)
    return ok(f"Unidade {bloco}-{numero} cadastrada."), 201


@app.delete("/api/admin/unidades/<int:unid>")
@admin_required
def api_excluir_unidade(unid):
    un = _busca_unidade(unid)
    if conta("SELECT COUNT(*) FROM votos WHERE unidade_id = ?", (unid,)):
        raise ErroValidacao("Unidades com votos registrados não podem ser excluídas.", 409)
    db = get_db()
    db.execute("DELETE FROM autorizacoes_voto WHERE unidade_id = ?", (unid,))
    db.execute("DELETE FROM proprietarios WHERE unidade_id = ?", (unid,))
    db.execute("DELETE FROM unidades WHERE id = ?", (unid,))
    db.commit()
    return ok(f"Unidade {un['bloco']}-{un['numero']} excluída.")


@app.post("/api/admin/unidades/<int:unid>/proprietarios")
@admin_required
def api_adicionar_proprietario(unid):
    _busca_unidade(unid)
    db = get_db()
    usuario_id = inteiro(dados_json().get("usuario_id"))
    u = _membro_ativo(usuario_id)
    if u is None:
        raise ErroValidacao("Escolha um morador válido.")
    try:
        db.execute("INSERT INTO proprietarios (unidade_id, usuario_id) VALUES (?,?)", (unid, usuario_id))
        msg = f"{u['nome']} vinculado(a) como proprietário(a)."
        if not conta("SELECT COUNT(*) FROM autorizacoes_voto WHERE unidade_id = ? AND ativo = 1", (unid,)):
            _define_votante(db, unid, usuario_id, "proprietario")
            msg += " Como a unidade não tinha votante, essa pessoa passou a votar por ela."
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ErroValidacao("Essa pessoa já é proprietária desta unidade.", 409)
    return ok(msg)


@app.delete("/api/admin/unidades/<int:unid>/proprietarios/<int:uid>")
@admin_required
def api_remover_proprietario(unid, uid):
    _busca_unidade(unid)
    db = get_db()
    db.execute("DELETE FROM proprietarios WHERE unidade_id = ? AND usuario_id = ?", (unid, uid))
    # quem votava como esse proprietário, ou por indicação dele, perde a autorização
    n = db.execute("""UPDATE autorizacoes_voto SET ativo = 0, data_fim = ?
                      WHERE unidade_id = ? AND ativo = 1
                        AND ((usuario_id = ? AND tipo = 'proprietario') OR indicado_por = ?)""",
                   (agora_registro(), unid, uid, uid)).rowcount
    db.commit()
    return ok("Proprietário removido." + (" A unidade ficou sem votante." if n else ""))


@app.post("/api/admin/unidades/<int:unid>/votante")
@admin_required
def api_definir_votante(unid):
    """Define o único votante da unidade: um proprietário ou um representante indicado por ele."""
    _busca_unidade(unid)
    db = get_db()
    d = dados_json()
    usuario_id, indicado_por = inteiro(d.get("usuario_id")), inteiro(d.get("indicado_por"))
    if not _membro_ativo(usuario_id):
        raise ErroValidacao("Escolha um morador válido.")

    def eh_dono(uid):
        return uid and db.execute("SELECT 1 FROM proprietarios WHERE unidade_id = ? AND usuario_id = ?",
                                  (unid, uid)).fetchone()

    if eh_dono(usuario_id):
        _define_votante(db, unid, usuario_id, "proprietario")
    elif eh_dono(indicado_por):
        _define_votante(db, unid, usuario_id, "representante", indicado_por)
    else:
        raise ErroValidacao("Quem não é proprietário precisa ser indicado por um proprietário da unidade.")
    db.commit()
    return ok("Votante da unidade atualizado.")


# ---------- Erros ----------
@app.errorhandler(ErroValidacao)
def trata_erro_validacao(e):
    return jsonify(erro=e.mensagem), e.status


@app.errorhandler(HTTPException)
def trata_http(e):
    if request.path.startswith("/api/"):
        mensagens = {404: "Recurso não encontrado.", 405: "Método não permitido.",
                     413: "Arquivo grande demais (máximo de 20 MB)."}
        return jsonify(erro=mensagens.get(e.code, "Requisição inválida.")), e.code
    return e


# ---------- Frontend React (build em frontend/dist) ----------
@app.get("/", defaults={"caminho": ""})
@app.get("/<path:caminho>")
def frontend(caminho):
    if caminho.startswith("api/"):
        abort(404)
    if caminho and os.path.isfile(os.path.join(DIST, caminho)):
        return send_from_directory(DIST, caminho)
    if not os.path.isfile(os.path.join(DIST, "index.html")):
        return ("Frontend não compilado. Rode: cd frontend && npm install && npm run build", 503,
                {"Content-Type": "text/plain; charset=utf-8"})
    resp = send_from_directory(DIST, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


if __name__ == "__main__":
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", 5050)),
            debug=os.environ.get("FLASK_DEBUG") == "1")
