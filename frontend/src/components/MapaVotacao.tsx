import { useState } from "react";
import { Card, ToggleButton, ToggleButtonGroup } from "react-bootstrap";
import { formataData } from "../formato";
import type { DetalheVotacao } from "../tipos";
import { Predios, type ItemPredio } from "./Predios";
import { Icone } from "./ui";

type Modo = "participacao" | "votos";
type Sit = "votou" | "nao_votou" | "sem_votante" | "vaga";

const SITS: { id: Sit; rotulo: string; icone?: string }[] = [
  { id: "votou", rotulo: "Votou", icone: "check" },
  { id: "nao_votou", rotulo: "Ainda não votou", icone: "relogio" },
  { id: "sem_votante", rotulo: "Sem votante", icone: "alerta" },
  { id: "vaga", rotulo: "Vaga" },
];
// No mapa qualquer apartamento pode ficar ao lado de qualquer outro: só 3 cores passam no teste de daltonismo.
const MAX_CORES = 3;

/** Desenho dos prédios para a votação (visão do síndico): quem votou, quem falta e, opcionalmente, em quê. */
export default function MapaVotacao({ dados }: { dados: DetalheVotacao }) {
  const [modo, setModo] = useState<Modo>("participacao");
  const [foco, setFoco] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const encerrada = dados.votacao.estado === "encerrada";
  const nominal = dados.nominal ?? [];
  const pendentes = dados.pendentes ?? [];
  if (!nominal.length && !pendentes.length) return null;

  // cor segue a opção (ordem de cadastro), nunca a posição no resultado
  const slot = new Map(dados.opcoes.map((o, i) => [o.id, i < MAX_CORES ? `op${i + 1}` : "op-outras"]));
  const numero = new Map(dados.opcoes.map((o, i) => [o.id, i + 1]));
  const temOutras = dados.opcoes.length > MAX_CORES;

  type Unidade = { id: number; bloco: string; numero: string; sit: Sit; grupo: string; nome: string | null; opcao?: string; opcaoId?: number; quando?: string };
  const unidades: Unidade[] = [
    ...nominal.map((n) => ({ id: n.unidade_id, bloco: n.bloco, numero: n.numero, sit: "votou" as Sit, grupo: slot.get(n.opcao_id) ?? "op-outras",
                             nome: n.nome, opcao: n.opcao, opcaoId: n.opcao_id, quando: n.data_hora })),
    ...pendentes.map((p) => {
      const sit: Sit = p.vaga ? "vaga" : p.votante ? "nao_votou" : "sem_votante";
      return { id: p.unidade_id, bloco: p.bloco, numero: p.numero, sit, grupo: sit, nome: p.votante };
    }),
  ].sort((a, b) => a.bloco.localeCompare(b.bloco) || Number.parseInt(a.numero, 10) - Number.parseInt(b.numero, 10) || a.numero.localeCompare(b.numero));

  const chave = (u: Unidade) => (modo === "votos" ? u.grupo : u.sit);
  const rotuloSit = (s: Sit) => (s === "nao_votou" && encerrada ? "Não votou" : SITS.find((x) => x.id === s)!.rotulo);

  // legenda (também é filtro)
  const legenda = modo === "participacao"
    ? SITS.map((s) => ({ id: s.id, classe: `s-v-${s.id}`, rotulo: rotuloSit(s.id), icone: s.icone, n: unidades.filter((u) => u.sit === s.id).length }))
    : [
        ...dados.opcoes.slice(0, MAX_CORES).map((o, i) => ({ id: `op${i + 1}`, classe: `s-op${i + 1}`, rotulo: o.texto, marca: i + 1,
                                                              n: unidades.filter((u) => u.opcaoId === o.id).length })),
        ...(temOutras ? [{ id: "op-outras", classe: "s-op-outras", rotulo: "Outras opções", n: unidades.filter((u) => u.grupo === "op-outras").length }] : []),
        ...SITS.slice(1).map((s) => ({ id: s.id, classe: `s-v-${s.id}`, rotulo: rotuloSit(s.id), icone: s.icone, n: unidades.filter((u) => u.sit === s.id).length })),
      ];

  const itens: ItemPredio[] = unidades.map((u) => {
    const sit = SITS.find((s) => s.id === u.sit)!;
    const votoVisivel = modo === "votos" && u.sit === "votou";
    const n = u.opcaoId ? numero.get(u.opcaoId) : undefined;
    return {
      id: u.id, bloco: u.bloco, numero: u.numero,
      classe: votoVisivel ? `s-${u.grupo}` : `s-v-${u.sit}`,
      icone: votoVisivel ? undefined : sit.icone,
      rotulo: votoVisivel ? <span className="apto-opcao">{n}</span> : undefined,
      apagado: !!foco && foco !== chave(u),
      titulo: `${u.bloco}-${u.numero}: ${u.sit === "votou" ? `votou${modo === "votos" ? ` em ${u.opcao}` : ""}` : rotuloSit(u.sit)}${u.nome ? ` · ${u.nome}` : ""}`,
    };
  });

  const sel = unidades.find((u) => u.id === aberta);

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div className="small text-body-secondary">
            <strong className="text-body tabular">{nominal.length}</strong> de {unidades.length} unidades votaram. Clique num apartamento para ver o detalhe.
          </div>
          <ToggleButtonGroup type="radio" name="modo-mapa" size="sm" value={modo} onChange={(m: Modo) => { setModo(m); setFoco(null); }}>
            <ToggleButton id="modo-participacao" value="participacao" variant="outline-secondary">Participação</ToggleButton>
            <ToggleButton id="modo-votos" value="votos" variant="outline-secondary">Votos</ToggleButton>
          </ToggleButtonGroup>
        </div>

        <div className="mapa-legenda mb-2" role="group" aria-label="Filtrar o mapa">
          {legenda.map((l) => (
            <button key={l.id} type="button" aria-pressed={foco === l.id} className={`mapa-legenda-item ${foco === l.id ? "ativo" : ""}`}
                    onClick={() => setFoco(foco === l.id ? null : l.id)}>
              <span className={`mapa-amostra ${l.classe}`}>
                {"marca" in l && l.marca ? <span className="apto-opcao">{l.marca}</span> : "icone" in l && l.icone ? <Icone nome={l.icone} tamanho={10} /> : null}
              </span>
              <span className="text-truncate" style={{ maxWidth: 220 }}>{l.rotulo}</span> <span className="tabular text-body-secondary">{l.n}</span>
            </button>
          ))}
        </div>

        <Predios itens={itens} aoClicar={(id) => setAberta(aberta === id ? null : id)}
                 rodape={(its) => `${its.filter((i) => unidades.find((u) => u.id === i.id)?.sit === "votou").length}/${its.length} votaram`} />

        {sel && (
          <div className="mapa-detalhe mt-3" aria-live="polite">
            <span className="unidade-tag grande">{sel.bloco}-{sel.numero}</span>
            <div className="small flex-grow-1">
              {sel.sit === "votou" ? (
                <><strong>{sel.nome}</strong> votou em <strong>{sel.opcao}</strong>
                  <div className="text-body-secondary">{formataData(sel.quando)}</div></>
              ) : sel.sit === "sem_votante" ? (
                <span className="text-warning-emphasis">Sem votante definido: esta unidade não pode votar.</span>
              ) : (
                <><strong>{sel.nome ?? "Sem votante"}</strong> · {rotuloSit(sel.sit).toLowerCase()}
                  {sel.sit === "vaga" && <div className="text-body-secondary">Unidade marcada como vaga.</div>}</>
              )}
            </div>
            <button type="button" className="btn-close" aria-label="Fechar detalhe" onClick={() => setAberta(null)} />
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
