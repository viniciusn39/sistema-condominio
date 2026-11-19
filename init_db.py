"""Cria o banco de dados.

Uso:
  python init_db.py              cria um banco só com o síndico
  python init_db.py --demo       cria com moradores, unidades e votações de exemplo
  python init_db.py --force ...  APAGA o banco existente antes (todos os votos são perdidos)

O login inicial do síndico vem das variáveis EMAIL_SINDICO e SENHA_SINDICO
(padrão: admin@condominio.com / admin123).
"""
import os
import secrets
import sqlite3
import sys
from datetime import timedelta

from werkzeug.security import generate_password_hash

from utils import FMT, FMT_SEG, agora

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DATABASE", os.path.join(BASE, "votacao.db"))
EMAIL_SINDICO = os.environ.get("EMAIL_SINDICO", "admin@condominio.com").strip().lower()


def criar(caminho, demo=False, extras=False):
    db = sqlite3.connect(caminho)
    db.execute("PRAGMA foreign_keys = ON")
    with open(os.path.join(BASE, "schema.sql"), encoding="utf-8") as f:
        db.executescript(f.read())
    agora_ = agora().strftime(FMT_SEG)
    db.execute(
        "INSERT INTO usuarios (nome, cpf, email, senha_hash, perfil, criado_em) VALUES (?,?,?,?, 'admin', ?)",
        ("Síndico", "52998224725", EMAIL_SINDICO,
         generate_password_hash(os.environ.get("SENHA_SINDICO", "admin123")), agora_),
    )
    # o condomínio inicial (id 1). Na demonstração, dados fictícios.
    nome = os.environ.get("CONDOMINIO_NOME", "").strip() or ("Residencial Jardim das Acácias" if demo else "Meu condomínio")
    if demo:
        db.execute("""INSERT INTO condominios (nome, tipo, cep, logradouro, numero, bairro, cidade, uf, n_blocos,
                      n_unidades, convite_token, criado_em, criado_por)
                      VALUES (?, 'residencial', '01310100', 'Avenida Exemplo', '1000', 'Centro', 'São Paulo', 'SP',
                              2, 8, ?, ?, 1)""", (nome, secrets.token_urlsafe(12), agora_))
    else:
        db.execute("INSERT INTO condominios (nome, convite_token, criado_em, criado_por) VALUES (?,?,?,1)",
                   (nome, secrets.token_urlsafe(12), agora_))
    hoje = agora().date()
    db.execute("""INSERT INTO membros (condominio_id, usuario_id, papel, desde, sindico_tipo, mandato_inicio, mandato_fim)
                  VALUES (1, 1, 'sindico', ?, 'morador', ?, ?)""",
               (agora_, hoje.strftime("%Y-%m-%d"), (hoje + timedelta(days=730)).strftime("%Y-%m-%d")))
    if demo:
        _dados_demo(db, extras)
        _documentos_demo(db, os.path.join(os.path.dirname(os.path.abspath(caminho)), "documentos"))
    db.commit()
    db.close()


def _dados_demo(db, extras=False):
    hoje = agora().strftime("%Y-%m-%d")
    senha = generate_password_hash("123456")
    moradores = {}
    for i, (nome, cpf) in enumerate(
        [("Ana Souza", "12345678909"), ("Bruno Lima", "39053344705"),
         ("Carla Dias", "86140265363"), ("Diego Rocha", "74381592050"),
         ("Elisa Martins", "26851903768")], start=1):
        cur = db.execute("INSERT INTO usuarios (nome, cpf, email, senha_hash) VALUES (?,?,?,?)",
                         (nome, cpf, f"morador{i}@teste.com", senha))
        moradores[i] = cur.lastrowid
        db.execute("INSERT INTO membros (condominio_id, usuario_id, papel, desde) VALUES (1, ?, 'morador', ?)",
                   (cur.lastrowid, hoje))
    # Diego e Elisa receberam o acesso mas ainda não entraram (aparece no mapa do condomínio)
    for i, dias in ((1, 1), (2, 3), (3, 12)):
        db.execute("UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?",
                   ((agora() - timedelta(days=dias)).strftime(FMT_SEG), moradores[i]))

    unidades = {}
    for bloco in "AB":
        for numero in ("101", "102", "201"):
            cur = db.execute("INSERT INTO unidades (condominio_id, bloco, numero) VALUES (1,?,?)", (bloco, numero))
            unidades[f"{bloco}-{numero}"] = cur.lastrowid
    if extras:  # só na demonstração: uma unidade sem cadastro e uma vaga, para o mapa
        db.execute("INSERT INTO unidades (condominio_id, bloco, numero) VALUES (1, 'A', '202')")
        db.execute("INSERT INTO unidades (condominio_id, bloco, numero, vaga) VALUES (1, 'B', '202', 1)")

    # Ana é dona de dois apartamentos; Elisa indicou Diego como representante do B-102.
    donos = {"A-101": 1, "A-102": 2, "A-201": 3, "B-101": 4, "B-102": 5, "B-201": 1}
    for un, m in donos.items():
        db.execute("INSERT INTO proprietarios VALUES (?,?)", (unidades[un], moradores[m]))
        if un == "B-102":
            db.execute("INSERT INTO autorizacoes_voto (unidade_id, usuario_id, tipo, indicado_por, data_inicio) "
                       "VALUES (?,?, 'representante', ?, ?)",
                       (unidades[un], moradores[4], moradores[5], hoje))
        else:
            db.execute("INSERT INTO autorizacoes_voto (unidade_id, usuario_id, tipo, data_inicio) "
                       "VALUES (?,?, 'proprietario', ?)", (unidades[un], moradores[m], hoje))

    n = agora().replace(second=0)

    def votacao(titulo, descricao, inicio, fim, opcoes, quorum=0, maioria="simples", fundamento=None):
        cur = db.execute("INSERT INTO votacoes (condominio_id, titulo, descricao, data_inicio, data_fim, quorum_minimo, "
                         "maioria, fundamento) VALUES (1,?,?,?,?,?,?,?)",
                         (titulo, descricao, inicio.strftime(FMT), fim.strftime(FMT), quorum, maioria, fundamento))
        ids = [db.execute("INSERT INTO opcoes (votacao_id, texto) VALUES (?,?)", (cur.lastrowid, o)).lastrowid
               for o in opcoes]
        return cur.lastrowid, ids

    def voto(vid, un, quem, opcao, quando):
        db.execute("INSERT INTO votos (votacao_id, unidade_id, usuario_id, opcao_id, data_hora) VALUES (?,?,?,?,?)",
                   (vid, unidades[un], moradores[quem], opcao, quando.strftime(FMT_SEG)))

    # Encerrada
    ini = n - timedelta(days=20)
    vid, (sim, nao, abst) = votacao(
        "Aprovação das contas de 2025",
        "Prestação de contas do exercício de 2025, conforme balancete enviado por e-mail.",
        ini, n - timedelta(days=13), ["Aprovo", "Reprovo", "Abstenção"], quorum=50,
        fundamento="Art. 18 da Convenção (aprovação das contas)")
    for un, quem, op, h in (("A-101", 1, sim, 2), ("A-102", 2, sim, 5), ("A-201", 3, nao, 26),
                            ("B-101", 4, sim, 30), ("B-102", 4, abst, 31)):
        voto(vid, un, quem, op, ini + timedelta(hours=h))

    # Aberta
    ini = n - timedelta(days=1)
    vid, (sim, _, _) = votacao(
        "Pintura da fachada",
        "Orçamento vencedor: R$ 84.000, em 6 parcelas cobradas junto com o condomínio.\n"
        "Início previsto da obra: março.",
        ini, n + timedelta(days=3), ["Aprovo", "Reprovo", "Abstenção"], quorum=50,
        fundamento="Art. 22 da Convenção (obras úteis)")
    voto(vid, "A-102", 2, sim, ini + timedelta(hours=3))

    # Agendada
    votacao("Carregadores para carros elétricos na garagem",
            "Instalação de 4 pontos de recarga, com cobrança individual por consumo.",
            n + timedelta(days=2), n + timedelta(days=9), ["Aprovo", "Reprovo", "Abstenção"],
            quorum=50, maioria="dois_tercos", fundamento="Art. 22, § 2º da Convenção (alteração de área comum)")

    # Mural de avisos (o síndico tem id 1)
    for titulo, texto, categoria, fixado, dias in (
        ("Limpeza da caixa d'água",
         "Na próxima terça-feira, das 8h às 14h, a água será interrompida para a limpeza semestral das caixas. "
         "Recomendamos reservar água para o período.", "manutencao", 1, 1),
        ("Votação da pintura da fachada está aberta",
         "A votação sobre a pintura da fachada já está disponível no sistema. Os orçamentos estão na descrição "
         "da pauta. Participe: a decisão só vale com pelo menos metade das unidades votando.", "assembleia", 0, 1),
        ("Novo horário da academia",
         "A partir do dia 1º, a academia funciona das 6h às 23h, todos os dias.", "geral", 0, 6),
    ):
        db.execute("INSERT INTO avisos (condominio_id, titulo, texto, categoria, fixado, autor_id, criado_em) "
                   "VALUES (1,?,?,?,?,1,?)",
                   (titulo, texto, categoria, fixado, (n - timedelta(days=dias)).strftime(FMT_SEG)))


def _documentos_demo(db, pasta):
    """Convenção e regimento fictícios, só para demonstrar a área de documentos."""
    import secrets
    from fpdf import FPDF

    textos = {
        "convencao": ("Convenção do Condomínio (modelo de demonstração)", [
            ("Art. 18", "A assembleia geral ordinária aprovará, por maioria simples dos presentes, as contas do exercício."),
            ("Art. 21", "As assembleias poderão ser realizadas de forma eletrônica, com votação online por período "
                        "determinado, conforme a Lei 14.309/2022, cabendo um voto a cada unidade autônoma."),
            ("Art. 22", "Obras úteis dependem do voto da maioria dos condôminos. A alteração de área comum depende "
                        "de dois terços das unidades (§ 2º)."),
            ("Art. 25", "O proprietário poderá indicar representante para votar em seu nome, mediante comunicação "
                        "à administração."),
        ]),
        "regimento": ("Regimento Interno (modelo de demonstração)", [
            ("Art. 3º", "O silêncio deve ser respeitado das 22h às 8h."),
            ("Art. 9º", "A academia funciona das 6h às 23h. O salão de festas deve ser reservado com 7 dias de antecedência."),
            ("Art. 14", "Mudanças devem ser agendadas com a portaria, de segunda a sábado, das 8h às 18h."),
        ]),
    }
    os.makedirs(pasta, exist_ok=True)
    for categoria, (titulo, artigos) in textos.items():
        pdf = FPDF()
        pdf.add_page()
        pdf.set_margins(22, 20, 22)
        pdf.set_font("Helvetica", "B", 15)
        pdf.multi_cell(0, 8, titulo, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "I", 9)
        pdf.multi_cell(0, 5, "Documento fictício gerado para demonstração do sistema.", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)
        for art, texto in artigos:
            pdf.set_font("Helvetica", "B", 10.5)
            pdf.cell(0, 7, art, new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 10.5)
            pdf.multi_cell(0, 6, texto, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(3)
        conteudo = bytes(pdf.output())
        nome = secrets.token_hex(16) + ".pdf"
        with open(os.path.join(pasta, nome), "wb") as f:
            f.write(conteudo)
        db.execute("INSERT INTO documentos (condominio_id, titulo, categoria, descricao, arquivo, nome_original, tamanho, "
                   "enviado_por, enviado_em) VALUES (1,?,?,?,?,?,?,1,?)",
                   (titulo.split(" (")[0], categoria, "Versão consolidada. " + titulo.split("(")[1].rstrip(")").capitalize() + ".",
                    nome, f"{categoria}.pdf", len(conteudo), agora().strftime(FMT_SEG)))


def main(argv):
    if os.path.exists(DB_PATH):
        if "--force" not in argv:
            print(f"Já existe um banco em {DB_PATH}.")
            print("Para APAGAR tudo (inclusive votos) e recriar, rode de novo com --force.")
            return 1
        os.remove(DB_PATH)
    demo = "--demo" in argv
    criar(DB_PATH, demo=demo, extras=demo)
    print("Banco criado em", DB_PATH)
    # a senha definida por variável de ambiente não vai para o log (ex.: docker logs)
    senha = "(a definida em SENHA_SINDICO)" if os.environ.get("SENHA_SINDICO") else "admin123"
    print("Login do síndico:", EMAIL_SINDICO, "/", senha)
    if demo:
        print("Moradores de teste: morador1@teste.com ... morador5@teste.com / 123456")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
