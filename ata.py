"""Gera a ata da votação em PDF (fpdf2, fontes padrão; texto convertido para Latin-1)."""
from fpdf import FPDF

from apuracao import MAIORIAS

TROCAS = {"“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-", "…": "...", "→": "->", "•": "-", "·": "-"}


def _t(texto):
    texto = "" if texto is None else str(texto)
    for de, para in TROCAS.items():
        texto = texto.replace(de, para)
    return texto.encode("latin-1", "replace").decode("latin-1")


class _Ata(FPDF):
    def __init__(self, cabecalho, preliminar):
        super().__init__(format="A4")
        self.cabecalho, self.preliminar = cabecalho, preliminar
        self.set_margins(20, 18, 20)
        self.set_auto_page_break(True, 20)
        self.alias_nb_pages()

    def header(self):
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 5, _t(self.cabecalho.upper()), new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(226, 232, 240)
        self.line(20, self.get_y() + 1, 190, self.get_y() + 1)
        self.ln(5)
        if self.preliminar:
            self.set_fill_color(254, 243, 199)
            self.set_text_color(146, 64, 14)
            self.set_font("Helvetica", "B", 9)
            self.cell(0, 7, _t("DOCUMENTO PRELIMINAR - a votação ainda não foi encerrada"), align="C", fill=True,
                      new_x="LMARGIN", new_y="NEXT")
            self.ln(3)
        self.set_text_color(15, 23, 42)

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 5, _t(f"Página {self.page_no()} de {{nb}}"), align="R")

    def secao(self, titulo):
        self.ln(3)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(67, 56, 202)
        self.cell(0, 7, _t(titulo), new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(15, 23, 42)
        self.ln(1)

    def campo(self, rotulo, valor):
        self.set_font("Helvetica", "B", 9.5)
        self.cell(48, 6, _t(rotulo))
        self.set_font("Helvetica", "", 9.5)
        self.multi_cell(0, 6, _t(valor), new_x="LMARGIN", new_y="NEXT")

    def tabela(self, colunas, larguras, linhas, alinhamentos=None):
        alinhamentos = alinhamentos or ["L"] * len(colunas)
        self.set_font("Helvetica", "B", 8.5)
        self.set_fill_color(241, 245, 249)
        self.set_draw_color(226, 232, 240)
        for c, w, a in zip(colunas, larguras, alinhamentos):
            self.cell(w, 7, _t(c), border="B", fill=True, align=a)
        self.ln()
        self.set_font("Helvetica", "", 9)
        for linha in linhas:
            if self.will_page_break(6.5):
                self.add_page()
            for valor, w, a in zip(linha, larguras, alinhamentos):
                texto = _t(valor)
                while texto and self.get_string_width(texto) > w - 2:
                    texto = texto[:-2] + "."
                self.cell(w, 6.5, texto, border="B", align=a)
            self.ln()


def gerar_ata(*, condominio, votacao, periodo, encerramento, resultado, apuracao, nominal, pendentes,
              total_unidades, gerado_em, produto):
    preliminar = apuracao["situacao"] == "em_andamento"
    pdf = _Ata(condominio or "Condomínio", preliminar)
    pdf.set_title(_t(f"Ata - {votacao['titulo']}"))
    pdf.set_creator(produto)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 9, _t("Ata de Votação Online"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(71, 85, 105)
    pdf.multi_cell(0, 6, _t(votacao["titulo"]), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(15, 23, 42)

    pdf.secao("1. Dados da votação")
    pdf.campo("Pauta", votacao["titulo"])
    if votacao["descricao"]:
        pdf.campo("Descrição", votacao["descricao"])
    pdf.campo("Período", periodo)
    if encerramento:
        pdf.campo("Encerramento", encerramento)
    pdf.campo("Modalidade", "Votação online, identificada, com um voto por unidade")
    pdf.campo("Quórum mínimo", f"{apuracao['quorum_minimo']}% das unidades ({apuracao['unidades_quorum']} de {total_unidades})"
              if apuracao["quorum_minimo"] else "Não exigido")
    pdf.campo("Maioria exigida", MAIORIAS[apuracao["maioria"]])
    if votacao["fundamento"]:
        pdf.campo("Fundamento", votacao["fundamento"])

    pdf.secao("2. Resultado")
    pdf.tabela(["Opção", "Votos", "% dos votos"], [110, 30, 30],
               [[i["texto"], i["total"], f"{i['pct']:.1f}%".replace(".", ",")] for i in resultado["itens"]],
               ["L", "R", "R"])
    pdf.ln(3)
    pdf.campo("Participação", f"{resultado['total']} de {total_unidades} unidades "
                              f"({str(apuracao['participacao']).replace('.', ',')}%)")
    pdf.campo("Quórum", "Atingido" if apuracao["quorum_atingido"] else "Não atingido")
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(238, 242, 255)
    pdf.multi_cell(0, 7, _t(apuracao["texto"]), fill=True, new_x="LMARGIN", new_y="NEXT", padding=2)

    pdf.secao("3. Registro de votos por unidade")
    if nominal:
        pdf.tabela(["Unidade", "Votante", "Voto", "Data e hora"], [22, 70, 45, 33],
                   [[f"{n['bloco']}-{n['numero']}", n["nome"], n["opcao"], n["data_hora_fmt"]] for n in nominal])
    else:
        pdf.set_font("Helvetica", "I", 9.5)
        pdf.cell(0, 6, _t("Nenhum voto registrado."), new_x="LMARGIN", new_y="NEXT")

    if pendentes:
        pdf.secao("4. Unidades que não votaram")
        pdf.set_font("Helvetica", "", 9.5)
        pdf.multi_cell(0, 6, _t(", ".join(f"{p['bloco']}-{p['numero']}" for p in pendentes)),
                       new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.multi_cell(0, 6, _t(
        "Nada mais havendo a tratar, lavra-se a presente ata, gerada eletronicamente pelo sistema "
        f"{produto} em {gerado_em} (horário de Brasília), a partir dos registros de voto de cada unidade, "
        "que vai assinada pelos responsáveis abaixo."), new_x="LMARGIN", new_y="NEXT")

    if pdf.will_page_break(35):
        pdf.add_page()
    pdf.ln(22)
    y = pdf.get_y()
    pdf.set_draw_color(100, 116, 139)
    for x, rotulo in ((20, "Síndico(a)"), (115, "Secretário(a)")):
        pdf.line(x, y, x + 75, y)
        pdf.set_xy(x, y + 1.5)
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(75, 5, _t(rotulo), align="C")
    return bytes(pdf.output())
