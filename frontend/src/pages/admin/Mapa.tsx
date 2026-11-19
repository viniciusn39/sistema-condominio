import { useState } from "react";
import { Badge, Button, Form, Offcanvas, ProgressBar } from "react-bootstrap";
import { Link } from "react-router-dom";
import { api, mensagemDeErro } from "../../api";
import { useFeedback } from "../../components/Feedback";
import { Predios } from "../../components/Predios";
import { Carregando, ErroCarregar, Icone } from "../../components/ui";
import { formataData } from "../../formato";
import { useApi } from "../../hooks";
import type { Mapa as DadosMapa, PessoaMapa, SituacaoUnidade, UnidadeMapa } from "../../tipos";

/** Ordem da legenda e o que cada situação significa. O ícone garante que a cor nunca é a única pista. */
const SITUACOES: { id: SituacaoUnidade; rotulo: string; dica: string; icone?: string }[] = [
  { id: "ativa", rotulo: "Cadastrado e ativo", dica: "Tem votante e ele já entrou no sistema", icone: "check" },
  { id: "nunca_acessou", rotulo: "Nunca entrou", dica: "Tem votante, mas ele ainda não acessou", icone: "relogio" },
  { id: "sem_votante", rotulo: "Sem votante", dica: "Proprietário cadastrado, falta definir quem vota", icone: "alerta" },
  { id: "sem_cadastro", rotulo: "Sem cadastro", dica: "Ninguém cadastrado nesta unidade" },
  { id: "vaga", rotulo: "Vaga", dica: "Unidade desocupada" },
];
const ROTULO = Object.fromEntries(SITUACOES.map((s) => [s.id, s.rotulo])) as Record<SituacaoUnidade, string>;

export default function Mapa() {
  const { dados, erro, recarregar } = useApi<DadosMapa>("/admin/mapa");
  const [foco, setFoco] = useState<SituacaoUnidade | null>(null);
  const [verVotos, setVerVotos] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);

  if (erro && !dados) return <ErroCarregar mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;

  const { unidades, ultima_votacao } = dados;
  const conta = (s: SituacaoUnidade) => unidades.filter((u) => u.situacao === s).length;
  const ativas = conta("ativa");
  const ocupadas = unidades.length - conta("vaga");
  const selecionada = unidades.find((u) => u.id === aberta) ?? null;

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="pagina-titulo">Mapa do condomínio</h1>
          <p className="text-body-secondary mb-0">Veja, prédio por prédio, quem já está cadastrado, quem falta e quais unidades estão vagas.</p>
        </div>
        <Link to="/admin/unidades" className="btn btn-outline-secondary"><Icone nome="predio" tamanho={16} /> Gerenciar unidades</Link>
      </div>

      {!unidades.length ? (
        <div className="vazio">
          <Icone nome="predio" tamanho={28} />
          <p className="mt-2 mb-3">Nenhuma unidade cadastrada ainda. Cadastre as unidades ou importe uma planilha para ver o mapa.</p>
          <Link to="/admin/importar" className="btn btn-primary btn-sm"><Icone nome="upload" tamanho={15} /> Importar planilha</Link>
        </div>
      ) : (
        <>
          <div className="card mb-4">
            <div className="card-body">
              <div className="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-2">
                <div>
                  <div className="small text-body-secondary">Unidades ocupadas com morador ativo no sistema</div>
                  <div className="fs-4 fw-semibold tabular">{ativas} <span className="fs-6 fw-normal text-body-secondary">de {ocupadas}</span></div>
                </div>
                {ultima_votacao && (
                  <Form.Check type="switch" id="ver-votos" checked={verVotos} onChange={(e) => setVerVotos(e.target.checked)}
                              label={<span className="small">Marcar quem votou em <strong>{ultima_votacao.titulo}</strong></span>} />
                )}
              </div>
              <ProgressBar now={ocupadas ? (100 * ativas) / ocupadas : 0} style={{ height: 8 }} aria-label="Unidades ativas" />

              <div className="mapa-legenda mt-3" role="group" aria-label="Filtrar por situação">
                {SITUACOES.map((s) => (
                  <button key={s.id} type="button" title={s.dica} aria-pressed={foco === s.id}
                          className={`mapa-legenda-item ${foco === s.id ? "ativo" : ""}`}
                          onClick={() => setFoco(foco === s.id ? null : s.id)}>
                    <span className={`mapa-amostra s-${s.id}`}>{s.icone && <Icone nome={s.icone} tamanho={10} />}</span>
                    {s.rotulo} <span className="tabular text-body-secondary">{conta(s.id)}</span>
                  </button>
                ))}
                {foco && <Button variant="link" size="sm" className="p-0 ms-1" onClick={() => setFoco(null)}>Mostrar todas</Button>}
              </div>
            </div>
          </div>

          <Predios
            aoClicar={setAberta}
            rodape={(itens) => `${itens.filter((i) => i.classe === "s-ativa").length}/${itens.length} ativas`}
            itens={unidades.map((u) => {
              const sit = SITUACOES.find((s) => s.id === u.situacao)!;
              return {
                id: u.id, bloco: u.bloco, numero: u.numero, classe: `s-${u.situacao}`, icone: sit.icone,
                apagado: !!foco && foco !== u.situacao,
                titulo: `${u.bloco}-${u.numero}: ${sit.rotulo}${u.votante ? ` · ${u.votante.nome}` : ""}`,
                marca: verVotos && u.votou_ultima ? <span className="apto-votou" title="Votou" /> : undefined,
              };
            })} />
          {verVotos && <p className="small text-body-secondary mt-3"><span className="apto-votou estatico" /> votou na última votação</p>}
        </>
      )}

      <Offcanvas show={!!selecionada} onHide={() => setAberta(null)} placement="end">
        {selecionada && <Detalhe u={selecionada} aoMudar={recarregar} />}
      </Offcanvas>
    </>
  );
}

function Pessoa({ p, papel }: { p: PessoaMapa; papel: string }) {
  return (
    <div className="border rounded-3 p-2 px-3 mb-2">
      <div className="d-flex justify-content-between gap-2">
        <strong className="small">{p.nome}</strong>
        <span className="small text-body-secondary">{papel}</span>
      </div>
      <div className="small text-body-secondary text-truncate">{p.email}</div>
      <div className="small mt-1">
        {p.ultimo_acesso
          ? <span className="text-success-emphasis">Último acesso em {formataData(p.ultimo_acesso)}</span>
          : <span className="text-warning-emphasis">Ainda não entrou no sistema</span>}
      </div>
    </div>
  );
}

function Detalhe({ u, aoMudar }: { u: UnidadeMapa; aoMudar: () => void }) {
  const { avisar } = useFeedback();
  const [salvando, setSalvando] = useState(false);

  const alternarVaga = async () => {
    setSalvando(true);
    try {
      const r = await api.put(`/admin/unidades/${u.id}/vaga`, { vaga: !u.vaga });
      avisar(r.mensagem ?? "Salvo.");
      aoMudar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setSalvando(false);
    }
  };

  const votanteEhDono = u.votante && u.proprietarios.some((p) => p.email === u.votante!.email);

  return (
    <>
      <Offcanvas.Header closeButton>
        <Offcanvas.Title as="div">
          <span className="unidade-tag grande me-2">{u.bloco}-{u.numero}</span>
          <Badge bg="" className={`apto-badge s-${u.situacao}`}>{ROTULO[u.situacao]}</Badge>
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <h2 className="h6">Proprietários</h2>
        {u.proprietarios.length
          ? u.proprietarios.map((p) => <Pessoa key={p.email} p={p} papel={votanteEhDono && p.email === u.votante!.email ? "Proprietário · vota" : "Proprietário"} />)
          : <p className="small text-body-secondary">Nenhum proprietário cadastrado.</p>}

        {u.votante && !votanteEhDono && (
          <>
            <h2 className="h6 mt-3">Quem vota</h2>
            <Pessoa p={u.votante} papel="Representante" />
          </>
        )}
        {!u.votante && !u.vaga && (
          <p className="small text-warning-emphasis mt-2"><Icone nome="alerta" tamanho={14} /> Esta unidade não pode votar enquanto não tiver votante.</p>
        )}

        <hr />
        <Form.Check type="switch" id={`vaga-${u.id}`} checked={u.vaga} disabled={salvando} onChange={alternarVaga}
                    label="Unidade vaga (desocupada)" />
        <p className="small text-body-secondary mt-1">Só muda a cor no mapa. A unidade continua contando para o quórum.</p>
        <Link to="/admin/unidades" className="btn btn-outline-primary btn-sm mt-2">Editar proprietários e votante</Link>
      </Offcanvas.Body>
    </>
  );
}
