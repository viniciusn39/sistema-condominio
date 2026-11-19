import { useEffect, useMemo, useRef, useState } from "react";
import { Icone } from "./ui";

/** Ilustração da página inicial: o mapa do condomínio "ganhando vida" (dados fictícios). */
type Sit = "ativa" | "nunca_acessou" | "sem_votante" | "sem_cadastro" | "vaga";

const PREDIOS = [
  { bloco: "A", andares: 5, porAndar: 4 },
  { bloco: "B", andares: 6, porAndar: 3 },
  { bloco: "C", andares: 4, porAndar: 4 },
];
const ICONE: Partial<Record<Sit, string>> = { ativa: "check", nunca_acessou: "relogio", sem_votante: "alerta" };
const LEGENDA: [Sit, string][] = [["ativa", "Ativo"], ["nunca_acessou", "Nunca entrou"], ["sem_votante", "Sem votante"], ["sem_cadastro", "Sem cadastro"], ["vaga", "Vaga"]];

function estadoInicial(): Sit[] {
  // padrão fixo (sem aleatório) para a primeira imagem ser sempre a mesma
  const total = PREDIOS.reduce((s, p) => s + p.andares * p.porAndar, 0);
  return Array.from({ length: total }, (_, i) =>
    i % 13 === 5 ? "vaga" : i % 7 === 3 ? "sem_votante" : i % 3 === 0 ? "nunca_acessou" : i % 2 === 0 ? "ativa" : "sem_cadastro");
}

export default function PreviaMapa() {
  const parado = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [sits, setSits] = useState<Sit[]>(estadoInicial);
  const [ultimo, setUltimo] = useState(-1);
  const atual = useRef(sits);
  atual.current = sits;

  useEffect(() => {
    if (parado) return;
    const id = window.setInterval(() => {
      const pendentes = atual.current.map((s, i) => [s, i] as const).filter(([s]) => s !== "ativa" && s !== "vaga");
      if (pendentes.length <= 3) {   // quase todos ativos: recomeça
        setUltimo(-1);
        setSits(estadoInicial());
        return;
      }
      const [s, i] = pendentes[Math.floor(Math.random() * pendentes.length)];
      const prox: Sit = s === "sem_cadastro" ? "nunca_acessou" : "ativa";
      setUltimo(i);
      setSits(atual.current.map((x, j) => (j === i ? prox : x)));
    }, 1100);
    return () => window.clearInterval(id);
  }, [parado]);

  const ocupadas = sits.filter((s) => s !== "vaga").length;
  const ativas = sits.filter((s) => s === "ativa").length;

  const predios = useMemo(() => {
    let k = 0;
    return PREDIOS.map((p) => ({
      ...p,
      andares: Array.from({ length: p.andares }, (_, a) => {
        const andar = p.andares - a;
        return { andar, aps: Array.from({ length: p.porAndar }, (_, n) => ({ numero: `${andar}0${n + 1}`, idx: k++ })) };
      }),   // último andar em cima
    }));
  }, []);

  return (
    <div className="previa-mapa" aria-hidden="true">
      <div className="previa-mapa-topo">
        <div>
          <div className="small text-body-secondary">Moradores ativos no sistema</div>
          <div className="fs-4 fw-semibold tabular lh-1 mt-1">{ativas} <span className="fs-6 fw-normal text-body-secondary">de {ocupadas} unidades</span></div>
        </div>
        <div className="previa-mapa-barra"><span style={{ width: `${(100 * ativas) / ocupadas}%` }} /></div>
      </div>
      <div className="mapa-predios previa-mapa-cena">
        {predios.map((p, i) => (
          <figure key={p.bloco} className="predio flutua-predio" style={{ animationDelay: `${i * -1.7}s` }}>
            <div className="predio-telhado" />
            <div className="predio-corpo">
              {p.andares.map(({ andar, aps }) => (
                <div key={andar} className="predio-andar">
                  <span className="predio-andar-rotulo">{andar}º</span>
                  <div className="predio-janelas">
                    {aps.map(({ numero, idx }) => {
                      const s = sits[idx];
                      return (
                        <span key={numero} className={`apto s-${s} ${idx === ultimo ? "acendeu" : ""}`}>
                          <span className="apto-numero tabular">{numero}</span>
                          {ICONE[s] && <Icone nome={ICONE[s]!} tamanho={10} />}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <figcaption className="predio-base"><strong>Bloco {p.bloco}</strong></figcaption>
          </figure>
        ))}
      </div>
      <div className="mapa-legenda mt-3">
        {LEGENDA.map(([s, r]) => (
          <span key={s} className="mapa-legenda-item">
            <span className={`mapa-amostra s-${s}`}>{ICONE[s] && <Icone nome={ICONE[s]!} tamanho={10} />}</span>{r}
          </span>
        ))}
      </div>
    </div>
  );
}
