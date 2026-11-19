"""Importação de unidades e moradores a partir de planilha (.csv ou .xlsx).

Cada linha é uma unidade e, opcionalmente, uma pessoa proprietária dela. O processo tem duas etapas:
simular (valida tudo e mostra o que vai acontecer, sem gravar) e confirmar (grava numa única transação).
"""
import csv
import io
import secrets
import unicodedata

from werkzeug.security import generate_password_hash

from utils import agora_registro, cpf_valido, formata_cpf, so_digitos

MAX_LINHAS = 2000
SINONIMOS = {
    "bloco": "bloco", "torre": "bloco",
    "numero": "numero", "apartamento": "numero", "apto": "numero", "unidade": "numero", "ap": "numero",
    "nome": "nome", "proprietario": "nome", "morador": "nome", "nome completo": "nome",
    "cpf": "cpf",
    "email": "email", "e-mail": "email", "e mail": "email",
    "vota": "vota", "votante": "vota", "vota pela unidade": "vota",
    "senha": "senha", "senha inicial": "senha",
}
MODELO = [
    ["bloco", "apartamento", "nome", "cpf", "email", "vota", "senha"],
    ["A", "101", "Maria da Silva", "529.982.247-25", "maria@email.com", "sim", ""],
    ["A", "102", "", "", "", "", ""],
]


class ErroPlanilha(Exception):
    pass


def _normaliza(texto):
    texto = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return " ".join(texto.lower().replace("_", " ").split())


def _sim(valor):
    return _normaliza(valor) in ("sim", "s", "x", "1", "true", "verdadeiro", "yes")


def ler_planilha(nome_arquivo, conteudo):
    """Devolve uma lista de dicionários com as colunas reconhecidas."""
    if conteudo[:2] == b"PK" or nome_arquivo.lower().endswith(".xlsx"):
        try:
            from openpyxl import load_workbook
            planilha = load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True).active
            linhas = [["" if c is None else str(c).strip() for c in r] for r in planilha.iter_rows(values_only=True)]
        except Exception:
            raise ErroPlanilha("Não foi possível ler o arquivo Excel. Salve como .xlsx ou .csv e tente de novo.")
    else:
        texto = None
        for codificacao in ("utf-8-sig", "cp1252"):
            try:
                texto = conteudo.decode(codificacao)
                break
            except UnicodeDecodeError:
                continue
        if texto is None:
            raise ErroPlanilha("Codificação do arquivo não reconhecida.")
        amostra = texto[:4096]
        delimitador = ";" if amostra.count(";") >= amostra.count(",") else ","
        linhas = [[c.strip() for c in r] for r in csv.reader(io.StringIO(texto), delimiter=delimitador)]

    linhas = [r for r in linhas if any(r)]
    if not linhas:
        raise ErroPlanilha("A planilha está vazia.")
    cabecalho = [SINONIMOS.get(_normaliza(c)) for c in linhas[0]]
    if "bloco" not in cabecalho or "numero" not in cabecalho:
        raise ErroPlanilha('A primeira linha precisa ter os títulos das colunas, com pelo menos "bloco" e "apartamento". '
                           "Baixe o modelo para ver o formato.")
    if len(linhas) - 1 > MAX_LINHAS:
        raise ErroPlanilha(f"Importe no máximo {MAX_LINHAS} linhas por vez.")
    registros = []
    for n, r in enumerate(linhas[1:], start=2):
        d = {"linha": n}
        for campo, valor in zip(cabecalho, r):
            if campo:
                d[campo] = valor
        registros.append(d)
    return registros


def _senha_gerada():
    alfabeto = "abcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alfabeto) for _ in range(10))


def planejar(db, registros, condominio_id):
    """Valida as linhas e descreve as ações, sem gravar nada."""
    unidades = {(u["bloco"], u["numero"]): u["id"] for u in
                db.execute("SELECT id, bloco, numero FROM unidades WHERE condominio_id = ?", (condominio_id,))}
    por_email = {u["email"]: dict(u) for u in db.execute("SELECT id, nome, email, cpf FROM usuarios")}
    por_cpf = {u["cpf"]: u for u in por_email.values()}
    novas_unidades, novos_emails, vistos_cpf = set(), {}, {}
    linhas = []

    for r in registros:
        bloco = str(r.get("bloco", "")).strip().upper()
        numero = str(r.get("numero", "")).strip()
        if numero.endswith(".0"):  # Excel transforma 101 em 101.0
            numero = numero[:-2]
        item = {"linha": r["linha"], "unidade": f"{bloco}-{numero}", "nome": str(r.get("nome", "")).strip(),
                "email": str(r.get("email", "")).strip().lower(), "acoes": [], "erro": None}
        linhas.append(item)
        if not bloco or not numero or len(bloco) > 10 or len(numero) > 10:
            item["erro"] = "Bloco e apartamento são obrigatórios (até 10 caracteres)."
            continue
        if (bloco, numero) not in unidades and (bloco, numero) not in novas_unidades:
            novas_unidades.add((bloco, numero))
            item["acoes"].append("cria unidade")
        item.update(bloco=bloco, numero=numero)

        cpf = so_digitos(str(r.get("cpf", "")))
        if not (item["nome"] or item["email"] or cpf):
            continue  # linha só com a unidade
        if not item["nome"] or not item["email"] or not cpf:
            item["erro"] = "Para cadastrar a pessoa, preencha nome, CPF e e-mail."
            continue
        if "@" not in item["email"] or "." not in item["email"].split("@")[-1]:
            item["erro"] = "E-mail inválido."
            continue
        if not cpf_valido(cpf):
            item["erro"] = "CPF inválido."
            continue
        senha = str(r.get("senha", "")).strip()
        if senha and len(senha) < 8:
            item["erro"] = "A senha, se informada, precisa ter pelo menos 8 caracteres."
            continue

        existente = por_email.get(item["email"])
        if existente:
            if existente["cpf"] != cpf:
                item["erro"] = "Este e-mail já tem conta no sistema com outro CPF."
                continue
            item["acoes"].append("usa morador já cadastrado")
        elif cpf in por_cpf:
            item["erro"] = "Este CPF já tem conta no sistema com outro e-mail."
            continue
        elif item["email"] in novos_emails:
            if novos_emails[item["email"]] != cpf:
                item["erro"] = "O mesmo e-mail aparece com CPFs diferentes na planilha."
                continue
            item["acoes"].append("mesma pessoa de outra linha")
        elif cpf in vistos_cpf:
            item["erro"] = "O mesmo CPF aparece com e-mails diferentes na planilha."
            continue
        else:
            novos_emails[item["email"]] = cpf
            vistos_cpf[cpf] = item["email"]
            item["acoes"].append("cadastra morador")
        item.update(cpf=cpf, senha=senha, vota=_sim(r.get("vota", "")))
        item["acoes"].append("define como votante" if item["vota"] else "vincula como proprietário")

    validas = [i for i in linhas if not i["erro"]]
    resumo = {
        "linhas": len(linhas),
        "erros": len(linhas) - len(validas),
        "unidades_novas": len(novas_unidades),
        "moradores_novos": len(novos_emails),
    }
    publico = [{k: i[k] for k in ("linha", "unidade", "nome", "email", "acoes", "erro")} for i in linhas]
    return linhas, publico, resumo


def executar(db, linhas, define_votante, condominio_id):
    """Grava as linhas válidas. Devolve as credenciais geradas para quem não tinha senha na planilha."""
    credenciais = []
    for item in linhas:
        if item["erro"]:
            continue
        db.execute("INSERT OR IGNORE INTO unidades (condominio_id, bloco, numero) VALUES (?, ?, ?)",
                   (condominio_id, item["bloco"], item["numero"]))
        unidade_id = db.execute("SELECT id FROM unidades WHERE condominio_id = ? AND bloco = ? AND numero = ?",
                                (condominio_id, item["bloco"], item["numero"])).fetchone()["id"]
        if "cpf" not in item:
            continue
        u = db.execute("SELECT id FROM usuarios WHERE email = ?", (item["email"],)).fetchone()
        if u is None:
            senha = item["senha"] or _senha_gerada()
            cur = db.execute("INSERT INTO usuarios (nome, cpf, email, senha_hash) VALUES (?,?,?,?)",
                             (item["nome"], item["cpf"], item["email"], generate_password_hash(senha)))
            usuario_id = cur.lastrowid
            if not item["senha"]:
                credenciais.append({"nome": item["nome"], "email": item["email"], "cpf": formata_cpf(item["cpf"]),
                                    "senha": senha})
        else:
            usuario_id = u["id"]
        # participa do condomínio (reativa se tinha sido desativado)
        db.execute("""INSERT INTO membros (condominio_id, usuario_id, papel, desde) VALUES (?, ?, 'morador', ?)
                      ON CONFLICT (condominio_id, usuario_id) DO UPDATE SET ativo = 1""",
                   (condominio_id, usuario_id, agora_registro()))
        db.execute("INSERT OR IGNORE INTO proprietarios (unidade_id, usuario_id) VALUES (?, ?)", (unidade_id, usuario_id))
        tem_votante = db.execute("SELECT 1 FROM autorizacoes_voto WHERE unidade_id = ? AND ativo = 1",
                                 (unidade_id,)).fetchone()
        if item["vota"] or not tem_votante:
            define_votante(db, unidade_id, usuario_id, "proprietario")
    return credenciais
