"""Testes da API. Rode com:  python -m pytest"""
import os
import sys
from datetime import timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as modulo  # noqa: E402
import init_db  # noqa: E402
from utils import FMT, agora  # noqa: E402

ADMIN = ("admin@condominio.com", "admin123")
ANA = ("morador1@teste.com", "123456")      # vota por A-101 e B-201
BRUNO = ("morador2@teste.com", "123456")    # vota por A-102 (já votou na votação aberta)
ELISA = ("morador5@teste.com", "123456")    # dona do B-102, mas quem vota é o Diego (representante)


@pytest.fixture
def client(tmp_path):
    caminho = str(tmp_path / "teste.db")
    init_db.criar(caminho, demo=True)
    modulo.app.config.update(TESTING=True, DATABASE=caminho, CSRF_ENABLED=False)
    modulo._falhas_login.clear()
    with modulo.app.test_client() as c:
        yield c


def entrar(c, credenciais):
    r = c.post("/api/login", json={"email": credenciais[0], "senha": credenciais[1]})
    assert r.status_code == 200, r.json
    return r.json["usuario"]


def votacao_por_estado(c, estado):
    return next(v for v in c.get("/api/votacoes").json["votacoes"] if v["estado"] == estado)


def minhas_unidades(c, vid):
    return c.get(f"/api/votacoes/{vid}").json["minhas"]


# ---------- autenticação ----------
def test_login_errado_e_bloqueio(client):
    for _ in range(5):
        assert client.post("/api/login", json={"email": ADMIN[0], "senha": "x"}).status_code == 401
    assert client.post("/api/login", json={"email": ADMIN[0], "senha": ADMIN[1]}).status_code == 429


def test_rotas_exigem_login(client):
    assert client.get("/api/votacoes").status_code == 401
    assert client.get("/api/sessao").json["usuario"] is None


def test_morador_nao_acessa_admin(client):
    entrar(client, ANA)
    assert client.get("/api/admin/resumo").status_code == 403
    assert client.post("/api/admin/votacoes", json={}).status_code == 403


def test_csrf_obrigatorio(client):
    modulo.app.config["CSRF_ENABLED"] = True
    try:
        r = client.post("/api/login", json={"email": ADMIN[0], "senha": ADMIN[1]})
        assert r.status_code == 403
        token = client.get("/api/sessao").json["csrf"]
        r = client.post("/api/login", json={"email": ADMIN[0], "senha": ADMIN[1]}, headers={"X-CSRF-Token": token})
        assert r.status_code == 200
    finally:
        modulo.app.config["CSRF_ENABLED"] = False


def test_trocar_senha(client):
    entrar(client, ANA)
    assert client.post("/api/conta/senha", json={"atual": "errada", "nova": "novasenha1", "confirmacao": "novasenha1"}).status_code == 400
    assert client.post("/api/conta/senha", json={"atual": "123456", "nova": "curta", "confirmacao": "curta"}).status_code == 400
    assert client.post("/api/conta/senha", json={"atual": "123456", "nova": "novasenha1", "confirmacao": "novasenha1"}).status_code == 200
    client.post("/api/logout")
    entrar(client, (ANA[0], "novasenha1"))


# ---------- votação ----------
def test_um_voto_por_unidade(client):
    entrar(client, ANA)
    v = votacao_por_estado(client, "aberta")
    unidade = minhas_unidades(client, v["id"])[0]["id"]
    opcao = client.get(f"/api/votacoes/{v['id']}").json["opcoes"][0]["id"]
    r = client.post(f"/api/votacoes/{v['id']}/votar", json={"unidade_id": unidade, "opcao_id": opcao})
    assert r.status_code == 200
    r = client.post(f"/api/votacoes/{v['id']}/votar", json={"unidade_id": unidade, "opcao_id": opcao})
    assert r.status_code == 409


def test_nao_vota_por_unidade_de_outro(client):
    entrar(client, ANA)
    v = votacao_por_estado(client, "aberta")
    opcao = client.get(f"/api/votacoes/{v['id']}").json["opcoes"][0]["id"]
    # A-102 (id 2) é do Bruno
    assert client.post(f"/api/votacoes/{v['id']}/votar", json={"unidade_id": 2, "opcao_id": opcao}).status_code == 403


def test_proprietario_com_representante_nao_vota(client):
    entrar(client, ELISA)
    v = votacao_por_estado(client, "aberta")
    assert minhas_unidades(client, v["id"]) == []


def test_opcao_de_outra_votacao_e_rejeitada(client):
    entrar(client, ANA)
    aberta = votacao_por_estado(client, "aberta")
    encerrada = votacao_por_estado(client, "encerrada")
    opcao_errada = client.get(f"/api/votacoes/{encerrada['id']}").json["opcoes"][0]["id"]
    unidade = minhas_unidades(client, aberta["id"])[0]["id"]
    r = client.post(f"/api/votacoes/{aberta['id']}/votar", json={"unidade_id": unidade, "opcao_id": opcao_errada})
    assert r.status_code == 400


def test_nao_vota_em_votacao_encerrada_ou_agendada(client):
    entrar(client, ANA)
    for estado in ("encerrada", "agendada"):
        v = votacao_por_estado(client, estado)
        opcao = client.get(f"/api/votacoes/{v['id']}").json["opcoes"][0]["id"]
        r = client.post(f"/api/votacoes/{v['id']}/votar", json={"unidade_id": 1, "opcao_id": opcao})
        assert r.status_code == 400


def test_resultado_oculto_para_morador_ate_encerrar(client):
    entrar(client, ANA)
    aberta = votacao_por_estado(client, "aberta")
    encerrada = votacao_por_estado(client, "encerrada")
    assert client.get(f"/api/votacoes/{aberta['id']}").json["resultado"] is None
    res = client.get(f"/api/votacoes/{encerrada['id']}").json
    assert res["resultado"]["lideres"] == ["Aprovo"]
    assert "nominal" not in res  # lista nominal só para o síndico


def test_encerramento_automatico_pelo_horario(client):
    entrar(client, ADMIN)
    n = agora().replace(second=0)
    r = client.post("/api/admin/votacoes", json={
        "titulo": "Teste", "opcoes": ["Sim", "Não"],
        "data_inicio": (n - timedelta(hours=1)).strftime(FMT), "data_fim": (n + timedelta(hours=1)).strftime(FMT)})
    vid = r.json["id"]
    assert client.get(f"/api/votacoes/{vid}").json["votacao"]["estado"] == "aberta"
    # simula a passagem do tempo movendo o encerramento para o passado
    db = modulo.sqlite3.connect(modulo.app.config["DATABASE"])
    db.execute("UPDATE votacoes SET data_fim = ? WHERE id = ?", ((n - timedelta(minutes=1)).strftime(FMT), vid))
    db.commit()
    db.close()
    assert client.get(f"/api/votacoes/{vid}").json["votacao"]["estado"] == "encerrada"


# ---------- administração ----------
def test_criar_votacao_valida_dados(client):
    entrar(client, ADMIN)
    n = agora()
    base = {"titulo": "Pauta", "opcoes": ["Sim", "Não"],
            "data_inicio": n.strftime(FMT), "data_fim": (n + timedelta(days=1)).strftime(FMT)}
    assert client.post("/api/admin/votacoes", json={**base, "opcoes": ["Sim"]}).status_code == 400
    assert client.post("/api/admin/votacoes", json={**base, "opcoes": ["Sim", "Sim"]}).status_code == 400
    assert client.post("/api/admin/votacoes", json={**base, "data_fim": base["data_inicio"]}).status_code == 400
    assert client.post("/api/admin/votacoes", json={**base, "data_inicio": "ontem"}).status_code == 400
    assert client.post("/api/admin/votacoes", json={**base, "titulo": "  "}).status_code == 400
    assert client.post("/api/admin/votacoes", json=base).status_code == 201


def test_encerrar_manual_bloqueia_votos(client):
    entrar(client, ADMIN)
    v = votacao_por_estado(client, "aberta")
    assert client.post(f"/api/admin/votacoes/{v['id']}/encerrar").status_code == 200
    client.post("/api/logout")
    entrar(client, ANA)
    detalhe = client.get(f"/api/votacoes/{v['id']}").json
    assert detalhe["votacao"]["estado"] == "encerrada"
    assert detalhe["resultado"] is not None
    r = client.post(f"/api/votacoes/{v['id']}/votar",
                    json={"unidade_id": detalhe["minhas"][0]["id"], "opcao_id": detalhe["opcoes"][0]["id"]})
    assert r.status_code == 400


def test_nao_edita_nem_exclui_votacao_com_votos(client):
    entrar(client, ADMIN)
    v = votacao_por_estado(client, "aberta")  # já tem o voto do Bruno
    assert client.get(f"/api/votacoes/{v['id']}").json["pode_editar"] is False
    assert client.put(f"/api/admin/votacoes/{v['id']}", json={}).status_code == 409
    assert client.delete(f"/api/admin/votacoes/{v['id']}").status_code == 409
    agendada = votacao_por_estado(client, "agendada")
    assert client.delete(f"/api/admin/votacoes/{agendada['id']}").status_code == 200


def test_cadastro_de_morador_valida_cpf_e_duplicidade(client):
    entrar(client, ADMIN)
    novo = {"nome": "Fulano", "cpf": "111.111.111-11", "email": "fulano@teste.com", "senha": "12345678"}
    assert client.post("/api/admin/moradores", json=novo).status_code == 400
    novo["cpf"] = "529.982.247-25"  # mesmo CPF do síndico
    assert client.post("/api/admin/moradores", json=novo).status_code == 409
    novo["cpf"] = "153.509.460-56"
    assert client.post("/api/admin/moradores", json=novo).status_code == 201


def test_desativar_morador_remove_autorizacao(client):
    entrar(client, ADMIN)
    r = client.post("/api/admin/moradores/2/ativo")  # Ana
    assert r.status_code == 200 and "sem votante" in r.json["mensagem"]
    assert client.get("/api/admin/resumo").json["stats"]["sem_votante"] == 2
    client.post("/api/logout")
    # a conta continua existindo (pode participar de outros condomínios), mas perde o acesso a este
    r = client.post("/api/login", json={"email": ANA[0], "senha": ANA[1]})
    assert r.status_code == 200 and r.json["condominio_atual"] is None
    assert client.get("/api/votacoes").status_code == 409


def test_admin_nao_remove_o_proprio_acesso(client):
    entrar(client, ADMIN)
    assert client.post("/api/admin/moradores/1/ativo").status_code == 400


def test_representante_precisa_de_indicacao_de_proprietario(client):
    entrar(client, ADMIN)
    # Carla (id 4) não é dona do A-101 (id 1); sem indicação → erro
    assert client.post("/api/admin/unidades/1/votante", json={"usuario_id": 4}).status_code == 400
    # indicada pela Ana (id 2), dona do A-101 → ok
    assert client.post("/api/admin/unidades/1/votante", json={"usuario_id": 4, "indicado_por": 2}).status_code == 200
    u = next(u for u in client.get("/api/admin/unidades").json["unidades"] if u["id"] == 1)
    assert u["votante"] == {"nome": "Carla Dias", "tipo": "representante", "indicado_por": "Ana Souza"}


def test_remover_proprietario_remove_votante_indicado(client):
    entrar(client, ADMIN)
    # B-102 (id 5): Elisa (id 6) é dona e indicou Diego
    client.delete("/api/admin/unidades/5/proprietarios/6")
    u = next(u for u in client.get("/api/admin/unidades").json["unidades"] if u["id"] == 5)
    assert u["votante"] is None and u["proprietarios"] == []


def test_csv_neutraliza_formulas(client):
    entrar(client, ADMIN)
    n = agora()
    r = client.post("/api/admin/votacoes", json={
        "titulo": "=HYPERLINK(\"x\")", "opcoes": ["Sim", "Não"],
        "data_inicio": n.strftime(FMT), "data_fim": (n + timedelta(days=1)).strftime(FMT)})
    csv = client.get(f"/api/admin/votacoes/{r.json['id']}/votos.csv").get_data(as_text=True)
    primeira_linha = csv.splitlines()[0]
    assert "'=HYPERLINK" in primeira_linha
    assert ';=' not in primeira_linha and ';"=' not in primeira_linha


# ---------- quórum, maioria e ata ----------
def test_apuracao_quorum_e_maioria():
    from apuracao import apurar

    def res(*totais):
        m = max(totais)
        itens = [{"texto": f"op{i}", "total": t, "pct": 0, "lider": m > 0 and t == m} for i, t in enumerate(totais)]
        return {"itens": itens, "total": sum(totais)}

    v = {"quorum_minimo": 50, "maioria": "simples"}
    assert apurar(v, res(2, 1), 10, True)["situacao"] == "sem_quorum"      # 3 de 10 < 50%
    assert apurar(v, res(3, 2), 10, True)["situacao"] == "decidida"        # 5 de 10 = 50%
    assert apurar(v, res(3, 3), 10, True)["situacao"] == "empate"
    assert apurar(v, res(3, 2), 10, False)["situacao"] == "em_andamento"
    v = {"quorum_minimo": 0, "maioria": "dois_tercos"}
    assert apurar(v, res(6, 3), 10, True)["situacao"] == "sem_maioria"     # precisa de 7
    assert apurar(v, res(7, 1), 10, True)["vencedora"] == "op0"
    v = {"quorum_minimo": 0, "maioria": "absoluta"}
    assert apurar(v, res(5, 0), 10, True)["situacao"] == "sem_maioria"     # precisa de 6


def test_resultado_traz_apuracao_e_regras_sao_salvas(client):
    entrar(client, ADMIN)
    enc = votacao_por_estado(client, "encerrada")
    ap = client.get(f"/api/votacoes/{enc['id']}").json["resultado"]["apuracao"]
    assert ap["situacao"] == "decidida" and ap["vencedora"] == "Aprovo"
    corpo = {"titulo": "Teste", "opcoes": ["Sim", "Não"], "data_inicio": agora().strftime(FMT),
             "data_fim": (agora() + timedelta(days=2)).strftime(FMT), "quorum_minimo": 67, "maioria": "dois_tercos"}
    vid = client.post("/api/admin/votacoes", json=corpo).json["id"]
    v = client.get(f"/api/votacoes/{vid}").json["votacao"]
    assert (v["quorum_minimo"], v["maioria"]) == (67, "dois_tercos")
    assert client.post("/api/admin/votacoes", json={**corpo, "quorum_minimo": 150}).status_code == 400
    assert client.post("/api/admin/votacoes", json={**corpo, "maioria": "x"}).status_code == 400


def test_ata_pdf(client):
    entrar(client, ADMIN)
    for estado in ("encerrada", "aberta"):
        vid = votacao_por_estado(client, estado)["id"]
        r = client.get(f"/api/admin/votacoes/{vid}/ata.pdf")
        assert r.status_code == 200 and r.mimetype == "application/pdf" and r.data[:4] == b"%PDF"
    client.post("/api/logout")
    entrar(client, ANA)
    assert client.get(f"/api/admin/votacoes/{vid}/ata.pdf").status_code == 403


# ---------- mural de avisos ----------
def test_avisos_publicar_ler_e_contar(client):
    entrar(client, ADMIN)
    aid = client.post("/api/admin/avisos", json={"titulo": "Elevador", "texto": "Manutenção amanhã.",
                                                 "categoria": "manutencao", "fixado": True}).json["id"]
    assert client.post("/api/admin/avisos", json={"titulo": "", "texto": "x"}).status_code == 400
    client.post("/api/logout")

    entrar(client, ANA)
    lista = client.get("/api/avisos").json
    assert lista["avisos"][0]["id"] == aid and lista["avisos"][0]["fixado"]   # fixado vem primeiro
    assert lista["nao_lidos"] == 4 and "leituras" not in lista["avisos"][0]
    assert client.post("/api/admin/avisos", json={"titulo": "x", "texto": "y"}).status_code == 403
    client.post("/api/avisos/lidos")
    assert client.get("/api/avisos/nao-lidos").json["nao_lidos"] == 0
    client.post("/api/logout")

    entrar(client, ADMIN)
    leituras = client.get(f"/api/admin/avisos/{aid}/leituras").json
    assert "Ana Souza" in [l["nome"] for l in leituras["lidos"]]
    assert "Bruno Lima" in [n["nome"] for n in leituras["nao_lidos"]]
    assert "Síndico" not in [n["nome"] for n in leituras["nao_lidos"] + leituras["lidos"]]   # quem publicou não conta
    ana = next(l for l in leituras["lidos"] if l["nome"] == "Ana Souza")
    assert set(ana["unidades"].split(",")) == {"A-101", "B-201"}
    aviso = next(a for a in client.get("/api/avisos").json["avisos"] if a["id"] == aid)
    assert aviso["leituras"] == 1 and aviso["total_moradores"] == 5 and aviso["quem_viu"] == ["Ana Souza"]
    assert client.delete(f"/api/admin/avisos/{aid}").status_code == 200


def test_aviso_conta_como_visto_um_por_um(client):
    entrar(client, ADMIN)
    aid = client.post("/api/admin/avisos", json={"titulo": "Portão", "texto": "Troca do controle."}).json["id"]
    client.post("/api/logout")
    entrar(client, BRUNO)
    antes = client.get("/api/avisos/nao-lidos").json["nao_lidos"]
    r = client.post(f"/api/avisos/{aid}/lido")
    assert r.status_code == 200 and r.json["nao_lidos"] == antes - 1     # só este aviso
    assert client.post(f"/api/avisos/{aid}/lido").status_code == 200   # repetir não duplica
    assert client.post("/api/avisos/9999/lido").status_code == 404
    client.post("/api/logout")
    entrar(client, ADMIN)
    assert "Bruno Lima" in [l["nome"] for l in client.get(f"/api/admin/avisos/{aid}/leituras").json["lidos"]]


def test_autor_nao_ve_os_proprios_avisos_como_novos(client):
    import sqlite3   # avisos gravados direto no banco (como no seed), sem leitura do autor
    with sqlite3.connect(modulo.app.config["DATABASE"]) as db:
        db.execute("DELETE FROM avisos_lidos")
    entrar(client, ADMIN)
    r = client.get("/api/avisos").json
    assert r["nao_lidos"] == 0 and all(a["lido"] for a in r["avisos"])
    assert client.get("/api/avisos/nao-lidos").json["nao_lidos"] == 0


# ---------- importação de planilha ----------
def _planilha(*linhas):
    import io
    texto = "bloco;apartamento;nome;cpf;email;vota;senha\n" + "\n".join(linhas)
    return {"arquivo": (io.BytesIO(texto.encode("utf-8")), "moradores.csv")}


def test_importacao_simula_e_confirma(client):
    entrar(client, ADMIN)
    linhas = ("C;301;Fulano Teste;111.444.777-35;fulano@teste.com;sim;",
              "C;302;Fulano Teste;111.444.777-35;fulano@teste.com;;",
              "C;303;;;;;",
              "A;101;Ana Souza;123.456.789-09;morador1@teste.com;;")
    previa = client.post("/api/admin/importar", data=_planilha(*linhas)).json
    assert previa["resumo"] == {"linhas": 4, "erros": 0, "unidades_novas": 3, "moradores_novos": 1}
    assert client.get("/api/admin/unidades").json["unidades"][-1]["bloco"] != "C"   # simulação não grava

    r = client.post("/api/admin/importar", data={**_planilha(*linhas), "confirmar": "1"}).json
    assert [c["email"] for c in r["credenciais"]] == ["fulano@teste.com"]
    unidades = {f"{u['bloco']}-{u['numero']}": u for u in client.get("/api/admin/unidades").json["unidades"]}
    assert unidades["C-301"]["votante"]["nome"] == "Fulano Teste"
    assert unidades["C-302"]["votante"]["nome"] == "Fulano Teste"   # sem votante: o proprietário assume
    assert unidades["C-303"]["proprietarios"] == []
    client.post("/api/logout")
    entrar(client, ("fulano@teste.com", r["credenciais"][0]["senha"]))


def test_importacao_com_erro_nao_grava(client):
    entrar(client, ADMIN)
    dados = _planilha("D;1;Sem Cpf;123;x@teste.com;;", "D;2;Outro;529.982.247-25;outro@teste.com;;")
    previa = client.post("/api/admin/importar", data=dados).json
    assert previa["resumo"]["erros"] == 2   # CPF inválido e CPF do síndico com outro e-mail
    r = client.post("/api/admin/importar", data={**_planilha("D;1;Sem Cpf;123;x@teste.com;;"), "confirmar": "1"})
    assert r.status_code == 400
    r = client.post("/api/admin/importar", data={"arquivo": (__import__("io").BytesIO(b"nome;cpf\nx;y"), "a.csv")})
    assert r.status_code == 400 and "apartamento" in r.json["erro"]


def test_painel_da_pagina_de_votacoes(client):
    entrar(client, ANA)
    p = client.get("/api/votacoes").json["painel"]
    assert p["encerradas"] == 1 and p["participei"] == 1 and p["decididas"] == 1
    assert p["participacao_media"] == 83.3
    assert p["ultima"]["titulo"] == "Aprovação das contas de 2025"
    assert p["ultima"]["resultado"]["apuracao"]["vencedora"] == "Aprovo"


# ---------- documentos ----------
def test_documentos_enviar_consultar_excluir(client, tmp_path):
    import io
    entrar(client, ADMIN)
    lista = client.get("/api/documentos").json
    assert {d["categoria"] for d in lista["documentos"]} == {"convencao", "regimento"}   # demo
    assert lista["atas_sistema"][0]["titulo"] == "Aprovação das contas de 2025"
    r = client.post("/api/admin/documentos", data={"titulo": "Ata AGO 2025", "categoria": "ata",
                                                   "arquivo": (io.BytesIO(b"%PDF-1.4 teste"), "ata.pdf")})
    assert r.status_code == 201
    did = r.json["id"]
    falso = client.post("/api/admin/documentos", data={"titulo": "x", "arquivo": (io.BytesIO(b"MZ..."), "x.pdf")})
    assert falso.status_code == 400
    client.post("/api/logout")

    entrar(client, ANA)
    lista = client.get("/api/documentos").json
    assert "atas_sistema" not in lista
    arq = client.get(f"/api/documentos/{did}/arquivo")
    assert arq.status_code == 200 and arq.data.startswith(b"%PDF") and arq.mimetype == "application/pdf"
    assert client.post("/api/admin/documentos", data={"titulo": "x"}).status_code == 403
    client.post("/api/logout")

    entrar(client, ADMIN)
    assert client.delete(f"/api/admin/documentos/{did}").status_code == 200
    assert client.get(f"/api/documentos/{did}/arquivo").status_code == 404
    assert len(list((tmp_path / "documentos").iterdir())) == 2   # o arquivo excluído saiu do disco


def test_fundamento_da_votacao(client):
    entrar(client, ADMIN)
    corpo = {"titulo": "Teste", "opcoes": ["Sim", "Não"], "data_inicio": agora().strftime(FMT),
             "data_fim": (agora() + timedelta(days=2)).strftime(FMT), "fundamento": "Art. 22 da Convenção"}
    vid = client.post("/api/admin/votacoes", json=corpo).json["id"]
    assert client.get(f"/api/votacoes/{vid}").json["votacao"]["fundamento"] == "Art. 22 da Convenção"


def test_mapa_do_condominio(client):
    entrar(client, ADMIN)
    mapa = {f"{u['bloco']}-{u['numero']}": u for u in client.get("/api/admin/mapa").json["unidades"]}
    assert mapa["A-101"]["situacao"] == "ativa"              # Ana já entrou no sistema
    assert mapa["B-101"]["situacao"] == "nunca_acessou"      # Diego vota, mas nunca entrou
    assert mapa["A-102"]["votou_ultima"] is True              # Bruno votou na votação aberta
    r = client.put(f"/api/admin/unidades/{mapa['B-101']['id']}/vaga", json={"vaga": True})
    assert r.status_code == 200
    mapa = {f"{u['bloco']}-{u['numero']}": u for u in client.get("/api/admin/mapa").json["unidades"]}
    assert mapa["B-101"]["situacao"] == "vaga"
    client.post("/api/logout")
    entrar(client, BRUNO)
    assert client.get("/api/admin/mapa").status_code == 403


def test_login_registra_ultimo_acesso(client):
    entrar(client, ELISA)
    client.post("/api/logout")
    entrar(client, ADMIN)
    mapa = client.get("/api/admin/mapa").json["unidades"]
    b102 = next(u for u in mapa if (u["bloco"], u["numero"]) == ("B", "102"))
    assert b102["proprietarios"][0]["ultimo_acesso"]          # Elisa (dona) entrou agora
    assert b102["situacao"] == "nunca_acessou"                # quem vota é o Diego


# ---------- cadastro do síndico e vários condomínios ----------
def cadastro(**extra):
    hoje = agora().date()
    corpo = {
        "sindico": {"nome": "Marina Alves", "cpf": "111.444.777-35", "email": "marina@exemplo.com",
                    "telefone": "(11) 98888-7777", "senha": "senhaforte1", "confirmacao": "senhaforte1",
                    "sindico_tipo": "morador", "mandato_inicio": str(hoje), "mandato_fim": str(hoje + timedelta(days=700))},
        "condominio": {"nome": "Edifício Aurora", "cnpj": "11.222.333/0001-81", "tipo": "residencial",
                       "cep": "01001-000", "logradouro": "Rua das Flores", "numero": "200", "bairro": "Centro",
                       "cidade": "São Paulo", "uf": "SP", "n_blocos": 1, "n_unidades": 24},
        "aceite": True,
    }
    for chave, valor in extra.items():
        grupo, campo = chave.split("__")
        corpo[grupo][campo] = valor
    return corpo


def test_cadastro_do_sindico_cria_condominio_isolado(client):
    r = client.post("/api/cadastro", json=cadastro())
    assert r.status_code == 201, r.json
    assert r.json["usuario"]["perfil"] == "admin"
    assert r.json["condominio"] == "Edifício Aurora"
    # condomínio novo começa vazio: nada do condomínio de demonstração aparece
    assert client.get("/api/votacoes").json["votacoes"] == []
    assert client.get("/api/admin/unidades").json["unidades"] == []
    assert [m["nome"] for m in client.get("/api/admin/moradores").json["moradores"]] == ["Marina Alves"]
    assert client.get("/api/votacoes/1").status_code == 404           # votação de outro condomínio
    assert client.get("/api/documentos/1/arquivo").status_code == 404
    assert client.post("/api/admin/moradores/2/senha", json={"senha": "x" * 10}).status_code == 404
    assert client.post("/api/admin/unidades/1/vaga", json={"vaga": True}).status_code in (404, 405)
    dados = client.get("/api/admin/condominio").json
    assert dados["condominio"]["cnpj"] == "11222333000181" and dados["mandato"]["sindico_tipo"] == "morador"


def test_cadastro_valida_os_dados(client):
    assert client.post("/api/cadastro", json=cadastro(condominio__cnpj="11.222.333/0001-82")).status_code == 400
    assert client.post("/api/cadastro", json=cadastro(condominio__cep="123")).status_code == 400
    assert client.post("/api/cadastro", json=cadastro(sindico__confirmacao="outra")).status_code == 400
    assert client.post("/api/cadastro", json=cadastro(sindico__cpf="111.111.111-11")).status_code == 400
    hoje = agora().date()
    assert client.post("/api/cadastro", json=cadastro(sindico__mandato_fim=str(hoje + timedelta(days=1200)))).status_code == 400
    assert client.post("/api/cadastro", json=cadastro(sindico__sindico_tipo="empresa")).status_code == 400  # falta CNPJ
    sem_aceite = cadastro()
    sem_aceite["aceite"] = False
    assert client.post("/api/cadastro", json=sem_aceite).status_code == 400
    # e-mail já usado por outra conta
    assert client.post("/api/cadastro", json=cadastro(sindico__email=ADMIN[0])).status_code == 409


def test_sindico_com_dois_condominios_troca_entre_eles(client):
    entrar(client, ADMIN)
    corpo = cadastro()
    r = client.post("/api/condominios", json={"condominio": corpo["condominio"], "mandato": corpo["sindico"]})
    assert r.status_code == 201 and r.json["condominio"] == "Edifício Aurora"
    assert len(r.json["condominios"]) == 2
    assert client.get("/api/admin/unidades").json["unidades"] == []
    r = client.post("/api/condominios/1/entrar")
    assert r.status_code == 200 and len(client.get("/api/admin/unidades").json["unidades"]) == 6
    assert client.post("/api/condominios/999/entrar").status_code == 403


def test_morador_de_dois_condominios_nao_pode_ser_alterado_pelo_outro_sindico(client):
    # Marina cria o condomínio dela e inclui a Ana (mesmo e-mail e CPF da conta existente)
    client.post("/api/cadastro", json=cadastro())
    r = client.post("/api/admin/moradores", json={"nome": "Ana Souza", "email": ANA[0], "cpf": "12345678909",
                                                   "senha": "qualquer123", "perfil": "votante"})
    assert r.status_code == 201 and "já tinha conta" in r.json["mensagem"]
    ana = next(m for m in client.get("/api/admin/moradores").json["moradores"] if m["email"] == ANA[0])
    assert client.post(f"/api/admin/moradores/{ana['id']}/senha", json={"senha": "trocada123"}).status_code == 403
    r = client.put(f"/api/admin/moradores/{ana['id']}", json={"nome": "Outro Nome", "email": ANA[0],
                                                             "cpf": "12345678909", "perfil": "votante"})
    assert r.status_code == 403
    # a senha da Ana não mudou e ela vê os dois condomínios
    client.post("/api/logout")
    assert len(client.post("/api/login", json={"email": ANA[0], "senha": ANA[1]}).json["condominios"]) == 2


def test_banco_antigo_vira_o_primeiro_condominio(tmp_path):
    """Bancos de versões anteriores (sem condomínios) são migrados sem perder nada."""
    import sqlite3
    caminho = str(tmp_path / "antigo.db")
    db = sqlite3.connect(caminho)
    db.executescript("""
        CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, cpf TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL, perfil TEXT NOT NULL DEFAULT 'votante');
        CREATE TABLE unidades (id INTEGER PRIMARY KEY AUTOINCREMENT, bloco TEXT NOT NULL, numero TEXT NOT NULL,
            UNIQUE (bloco, numero));
        CREATE TABLE proprietarios (unidade_id INTEGER NOT NULL REFERENCES unidades(id),
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id), PRIMARY KEY (unidade_id, usuario_id));
        CREATE TABLE autorizacoes_voto (id INTEGER PRIMARY KEY AUTOINCREMENT, unidade_id INTEGER NOT NULL REFERENCES unidades(id),
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id), tipo TEXT NOT NULL, indicado_por INTEGER,
            data_inicio TEXT NOT NULL, data_fim TEXT, ativo INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE votacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, descricao TEXT,
            data_inicio TEXT NOT NULL, data_fim TEXT NOT NULL);
        CREATE TABLE opcoes (id INTEGER PRIMARY KEY AUTOINCREMENT, votacao_id INTEGER NOT NULL, texto TEXT NOT NULL);
        CREATE TABLE votos (id INTEGER PRIMARY KEY AUTOINCREMENT, votacao_id INTEGER NOT NULL,
            unidade_id INTEGER NOT NULL REFERENCES unidades(id), usuario_id INTEGER NOT NULL, opcao_id INTEGER NOT NULL,
            data_hora TEXT NOT NULL, UNIQUE (votacao_id, unidade_id));
    """)
    from werkzeug.security import generate_password_hash
    db.execute("INSERT INTO usuarios (nome, cpf, email, senha_hash, perfil) VALUES ('S', '52998224725', 's@x.com', ?, 'admin')",
               (generate_password_hash("admin123"),))
    db.execute("INSERT INTO unidades (bloco, numero) VALUES ('A', '101')")
    db.execute("INSERT INTO votacoes (titulo, data_inicio, data_fim) VALUES ('Antiga', '2020-01-01T10:00', '2020-01-02T10:00')")
    db.commit()
    db.close()
    modulo.app.config.update(TESTING=True, DATABASE=caminho, CSRF_ENABLED=False)
    modulo._falhas_login.clear()
    with modulo.app.test_client() as c:
        r = c.post("/api/login", json={"email": "s@x.com", "senha": "admin123"})
        assert r.status_code == 200 and r.json["usuario"]["perfil"] == "admin"
        assert [v["titulo"] for v in c.get("/api/votacoes").json["votacoes"]] == ["Antiga"]
        assert len(c.get("/api/admin/unidades").json["unidades"]) == 1
        assert c.post("/api/admin/unidades", json={"bloco": "A", "numero": "102"}).status_code == 201
