import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Icone } from "./ui";

/** Um apartamento no desenho: a cor vem da classe (s-ativa, s-vaga, ...) ou de --apto-* no style. */
export interface ItemPredio {
  id: number;
  bloco: string;
  numero: string;
  classe: string;
  titulo: string;
  icone?: string;
  marca?: ReactNode;       // detalhe extra no canto (ex.: ponto de "votou")
  rotulo?: ReactNode;      // texto pequeno abaixo do número (ex.: número da opção)
  style?: CSSProperties;
  apagado?: boolean;
}

/** "302" → 3º andar; números abaixo de 100 ficam no térreo; nomes livres ("Loja 1") vão para "Outras". */
export function andarDe(numero: string): number {
  const n = Number.parseInt(numero, 10);
  if (Number.isNaN(n)) return -1;
  return n >= 100 ? Math.floor(n / 100) : 0;
}

const rotuloAndar = (a: number) => (a === -1 ? "Outras" : a === 0 ? "Térreo" : `${a}º`);

export function Predios({ itens, aoClicar, rodape }: {
  itens: ItemPredio[];
  aoClicar?: (id: number) => void;
  /** texto à direita do nome do bloco (ex.: "3/4 ativas") */
  rodape?: (itensDoBloco: ItemPredio[]) => ReactNode;
}) {
  const predios = useMemo(() => {
    const blocos = new Map<string, Map<number, ItemPredio[]>>();
    for (const u of itens) {
      const andares = blocos.get(u.bloco) ?? new Map<number, ItemPredio[]>();
      const a = andarDe(u.numero);
      andares.set(a, [...(andares.get(a) ?? []), u]);
      blocos.set(u.bloco, andares);
    }
    return [...blocos.entries()].map(([bloco, andares]) => ({
      bloco,
      itens: [...andares.values()].flat(),
      andares: [...andares.entries()].sort((x, y) => y[0] - x[0]),   // último andar em cima
    }));
  }, [itens]);

  return (
    <div className="mapa-predios">
      {predios.map((p) => (
        <figure key={p.bloco} className="predio" aria-label={`Bloco ${p.bloco}`}>
          <div className="predio-telhado" aria-hidden />
          <div className="predio-corpo">
            {p.andares.map(([andar, aps]) => (
              <div key={andar} className="predio-andar">
                <span className="predio-andar-rotulo">{rotuloAndar(andar)}</span>
                <div className="predio-janelas">
                  {aps.map((u) => (
                    <button key={u.id} type="button" onClick={() => aoClicar?.(u.id)} style={u.style}
                            className={`apto ${u.classe} ${u.apagado ? "apagado" : ""}`} title={u.titulo} aria-label={u.titulo}>
                      <span className="apto-numero tabular">{u.numero}</span>
                      {u.rotulo ?? (u.icone && <Icone nome={u.icone} tamanho={11} />)}
                      {u.marca}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <figcaption className="predio-base">
            <strong>Bloco {p.bloco}</strong>
            {rodape && <span className="small text-body-secondary tabular">{rodape(p.itens)}</span>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
