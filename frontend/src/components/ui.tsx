import { useEffect, useRef, useState } from "react";
import { Badge, Button, ProgressBar, Spinner } from "react-bootstrap";
import { duracao, porcentagem, ROTULO_ESTADO } from "../formato";
import { PRODUTO } from "../marca";
import type { Estado, Votacao } from "../tipos";

const COR_ESTADO: Record<Estado, string> = { aberta: "success", agendada: "info", encerrada: "secondary" };

export function Selo({ estado }: { estado: Estado }) {
  const cor = COR_ESTADO[estado];
  return (
    <Badge pill bg="" className={`bg-${cor}-subtle text-${cor}-emphasis border border-${cor}-subtle`}>
      {estado === "aberta" && <span className="me-1" aria-hidden="true">●</span>}
      {ROTULO_ESTADO[estado]}
    </Badge>
  );
}

export function Barra({ parte, todo, fina }: { parte: number; todo: number; fina?: boolean }) {
  return (
    <ProgressBar now={porcentagem(parte, todo)} style={fina ? { height: ".4rem" } : undefined}
                 aria-label={`${parte} de ${todo}`} />
  );
}

/**
 * Contagem regressiva até a votação abrir ou encerrar. Usa os segundos calculados pelo servidor,
 * então não depende do relógio do aparelho. Ao chegar a zero chama `aoTerminar` (para recarregar os dados).
 */
export function Contagem({ votacao, aoTerminar }: { votacao: Votacao; aoTerminar?: () => void }) {
  const { segundos, estado } = votacao;
  const [restante, setRestante] = useState(segundos ?? 0);
  const terminou = useRef(false);

  useEffect(() => {
    if (segundos == null) return;
    const fim = Date.now() + segundos * 1000;
    terminou.current = false;
    setRestante(segundos);
    const t = setInterval(() => {
      const r = Math.max(0, Math.round((fim - Date.now()) / 1000));
      setRestante(r);
      if (r === 0 && !terminou.current) {
        terminou.current = true;
        clearInterval(t);
        setTimeout(() => aoTerminar?.(), 1200);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [segundos, aoTerminar]);

  if (segundos == null || estado === "encerrada") return null;
  const urgente = estado === "aberta" && restante < 3600;
  return (
    <span className={`small d-inline-flex align-items-center gap-1 ${urgente ? "text-warning-emphasis" : "text-body-secondary"}`}>
      <Icone nome="relogio" tamanho={15} />
      {estado === "aberta" ? "Encerra em" : "Abre em"}{" "}
      <strong className={`tabular ${urgente ? "" : "text-body"}`}>{duracao(restante)}</strong>
    </span>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 py-5 text-body-secondary" role="status">
      <Spinner animation="border" size="sm" variant="primary" />
      {texto}
    </div>
  );
}

export function ErroCarregar({ mensagem, tentar }: { mensagem: string; tentar?: () => void }) {
  return (
    <div className="vazio">
      <p className="mb-2">{mensagem}</p>
      {tentar && <Button variant="outline-secondary" size="sm" onClick={tentar}>Tentar de novo</Button>}
    </div>
  );
}

const ICONES: Record<string, string> = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  relogio: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  casa: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  grafico: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  sair: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
  chave: "M15 7a4 4 0 1 1-3.9 5H9v2H7v2H4v-3l5.1-5.1A4 4 0 0 1 15 7z",
  mais: "M12 5v14M5 12h14",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  lixo: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  lapis: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z",
  parar: "M6 6h12v12H6z",
  voltar: "M19 12H5M11 18l-6-6 6-6",
  busca: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  usuarios: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  sol: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  lua: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  sino: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  pino: "M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v7",
  alerta: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  pdf: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6",
  menu: "M4 6h16M4 12h16M4 18h16",
  calendario: "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  escudo: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z",
  documento: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  celular: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  seta: "M5 12h14M13 6l6 6-6 6",
  urna: "M4 13h16v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM8 13V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v8M10 8.5l1.5 1.5L14 7.5",
  mapa: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  predio: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h3a1 1 0 0 1 1 1v11M2 21h20M8 7h4M8 11h4M8 15h4",
};

export function Icone({ nome, tamanho = 18 }: { nome: string; tamanho?: number }) {
  return (
    <svg className="flex-shrink-0" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONES[nome] ?? ""} />
    </svg>
  );
}

/** Símbolo do Quórum: um "Q" cuja perna é o ✓ de voto confirmado. */
export function Simbolo({ tamanho = 32 }: { tamanho?: number }) {
  return (
    <svg className="simbolo" width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M20.4 22.2A7.6 7.6 0 1 1 23.6 16" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M15.2 18.4l3.2 3.1 6.8-7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Marca({ condominio }: { condominio?: string }) {
  return (
    <span className="marca">
      <Simbolo />
      <span>
        <strong>{PRODUTO}</strong>
        {condominio && <small>{condominio}</small>}
      </span>
    </span>
  );
}
