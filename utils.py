"""Funções compartilhadas: fuso horário, datas e CPF."""
import os
from datetime import datetime
from zoneinfo import ZoneInfo

# Todas as datas do sistema ficam no horário do condomínio (padrão: Brasília).
TZ = ZoneInfo(os.environ.get("CONDOMINIO_TZ", "America/Sao_Paulo"))

FMT = "%Y-%m-%dT%H:%M"            # formato das datas de abertura/encerramento
FMT_SEG = "%Y-%m-%d %H:%M:%S"     # formato dos registros (votos, encerramento manual)
_FORMATOS = (FMT, "%Y-%m-%dT%H:%M:%S", FMT_SEG, "%Y-%m-%d %H:%M", "%Y-%m-%d")


def agora():
    """Data/hora atual no fuso do condomínio, sem tzinfo (comparável ao que está no banco)."""
    return datetime.now(TZ).replace(tzinfo=None, microsecond=0)


def agora_registro():
    return agora().strftime(FMT_SEG)


def para_datetime(texto):
    """Converte os formatos de data usados no sistema. Lança ValueError se inválido."""
    texto = (texto or "").strip()
    for fmt in _FORMATOS:
        try:
            return datetime.strptime(texto, fmt)
        except ValueError:
            continue
    raise ValueError(f"data inválida: {texto!r}")


def so_digitos(texto):
    return "".join(c for c in (texto or "") if c.isdigit())


def cpf_valido(cpf):
    cpf = so_digitos(cpf)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for n in (9, 10):
        soma = sum(int(cpf[i]) * (n + 1 - i) for i in range(n))
        if (soma * 10) % 11 % 10 != int(cpf[n]):
            return False
    return True


def formata_cpf(cpf):
    c = so_digitos(cpf)
    return f"{c[:3]}.{c[3:6]}.{c[6:9]}-{c[9:]}" if len(c) == 11 else cpf


def cnpj_valido(cnpj):
    c = so_digitos(cnpj)
    if len(c) != 14 or c == c[0] * 14:
        return False
    for n in (12, 13):
        pesos = list(range(n - 7, 1, -1)) + list(range(9, 1, -1))
        soma = sum(int(c[i]) * pesos[i] for i in range(n))
        dv = 11 - soma % 11
        if (0 if dv >= 10 else dv) != int(c[n]):
            return False
    return True


def formata_cnpj(cnpj):
    c = so_digitos(cnpj)
    return f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}" if len(c) == 14 else cnpj


def email_valido(email):
    email = (email or "").strip()
    if len(email) > 254 or email.count("@") != 1 or " " in email:
        return False
    usuario, dominio = email.split("@")
    return bool(usuario) and "." in dominio and not dominio.startswith(".") and not dominio.endswith(".")


UFS = ("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE",
       "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO")
