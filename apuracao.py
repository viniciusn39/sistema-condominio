"""Regras de apuração: quórum mínimo de participação e tipo de maioria exigida."""

MAIORIAS = {
    "simples": "Maioria simples (opção mais votada entre os votos registrados)",
    "absoluta": "Maioria absoluta (mais da metade de todas as unidades)",
    "dois_tercos": "Dois terços de todas as unidades",
}
MAIORIAS_CURTO = {"simples": "Maioria simples", "absoluta": "Maioria absoluta", "dois_tercos": "2/3 das unidades"}


def votos_necessarios(maioria, total_unidades):
    """Votos que a opção vencedora precisa ter (None na maioria simples, que é relativa)."""
    if maioria == "absoluta":
        return total_unidades // 2 + 1
    if maioria == "dois_tercos":
        return -(-2 * total_unidades // 3)  # arredonda para cima
    return None


def apurar(votacao, resultado, total_unidades, encerrada):
    """Aplica quórum e maioria ao resultado.

    `situacao` é uma de: em_andamento, sem_votos, sem_quorum, empate, sem_maioria, decidida.
    """
    quorum = int(votacao["quorum_minimo"] or 0)
    maioria = votacao["maioria"] or "simples"
    total = resultado["total"]
    participacao = round(100 * total / total_unidades, 1) if total_unidades else 0
    unidades_quorum = -(-quorum * total_unidades // 100)  # unidades necessárias, arredondado para cima
    quorum_ok = total >= unidades_quorum

    lideres = [i for i in resultado["itens"] if i["lider"]]
    lider = lideres[0] if len(lideres) == 1 else None
    necessarios = votos_necessarios(maioria, total_unidades)
    maioria_ok = lider is not None and (necessarios is None or lider["total"] >= necessarios)

    if not encerrada:
        situacao = "em_andamento"
    elif total == 0:
        situacao = "sem_votos"
    elif not quorum_ok:
        situacao = "sem_quorum"
    elif lider is None:
        situacao = "empate"
    elif not maioria_ok:
        situacao = "sem_maioria"
    else:
        situacao = "decidida"

    textos = {
        "em_andamento": "Votação em andamento.",
        "sem_votos": "Nenhum voto foi registrado. Não houve deliberação.",
        "sem_quorum": f"Quórum não atingido: votaram {total} de {total_unidades} unidades ({participacao:.1f}%), "
                      f"e o mínimo era {quorum}% ({unidades_quorum} unidades). Não houve deliberação.",
        "empate": "Empate entre: " + ", ".join(i["texto"] for i in lideres) + ". Não houve deliberação.",
        "sem_maioria": (f"A opção mais votada ({lider['texto'] if lider else ''}, {lider['total'] if lider else 0} votos) "
                        f"não alcançou a {MAIORIAS_CURTO[maioria].lower()} exigida ({necessarios} votos). "
                        "Não houve deliberação."),
        "decidida": f"Opção vencedora: {lider['texto'] if lider else ''}, com {lider['total'] if lider else 0} "
                    f"voto(s), atendendo ao quórum e à {MAIORIAS_CURTO[maioria].lower()}.",
    }
    return {
        "quorum_minimo": quorum,
        "unidades_quorum": unidades_quorum,
        "quorum_atingido": quorum_ok,
        "participacao": participacao,
        "maioria": maioria,
        "maioria_rotulo": MAIORIAS_CURTO[maioria],
        "votos_necessarios": necessarios,
        "vencedora": lider["texto"] if situacao == "decidida" else None,
        "situacao": situacao,
        "texto": textos[situacao],
    }
