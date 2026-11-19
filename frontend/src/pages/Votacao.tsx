import { useState } from "react";
import { Badge, Button, Card, Col, Form, Row, Spinner, Table } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, mensagemDeErro } from "../api";
import { useAuth } from "../auth";
import { useFeedback } from "../components/Feedback";
import { GraficoParticipacao, GraficoResultado } from "../components/Graficos";
import { Barra, Carregando, Contagem, ErroCarregar, Icone, Selo } from "../components/ui";
import { formataData, formataPct, porcentagem } from "../formato";
import MapaVotacao from "../components/MapaVotacao";
import { useApi } from "../hooks";
import type { DetalheVotacao, MinhaUnidade, Opcao } from "../tipos";

const ROTULO_MAIORIA: Record<string, string> = { simples: "Maioria simples", absoluta: "Maioria absoluta", dois_tercos: "Maioria de 2/3" };

export default function Votacao() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const { avisar, confirmar } = useFeedback();
  const navegar = useNavigate();
  const { dados, erro, recarregar } = useApi<DetalheVotacao>(`/votacoes/${id}`);

  if (erro && !dados) return <ErroCarregar mensagem={erro} tentar={recarregar} />;
  if (!dados || !usuario) return <Carregando />;

  const { votacao: v, opcoes, minhas, resultado, total_votos, total_unidades } = dados;
  const admin = usuario.perfil === "admin";
  const encerrada = v.estado === "encerrada";
  const textos = Object.fromEntries(opcoes.map((o) => [o.id, o.texto]));

  const acao = async (pedido: Parameters<typeof confirmar>[0], executar: () => Promise<{ mensagem?: string }>, depois?: () => void) => {
    if (!(await confirmar(pedido))) return;
    try {
      const r = await executar();
      avisar(r.mensagem ?? "Feito.");
      if (depois) depois(); else recarregar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  };

  return (
    <>
      <Link className="link-secondary small d-inline-flex align-items-center gap-1 mb-3" to={admin ? "/admin" : "/votacoes"}>
        <Icone nome="voltar" tamanho={16} /> Voltar
      </Link>

      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div className="min-w-0" style={{ flex: "1 1 420px" }}>
          <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
            <Selo estado={v.estado} /><Contagem votacao={v} aoTerminar={recarregar} />
          </div>
          <h1 className="pagina-titulo text-break">{v.titulo}</h1>
          <p className="text-body-secondary mb-0">
            {formataData(v.data_inicio)} até {formataData(v.data_fim)}
            {v.encerrada_em && ` · encerrada pelo síndico em ${formataData(v.encerrada_em)}`}
          </p>
          <div className="d-flex flex-wrap gap-2 mt-2 small">
            <span className="badge bg-body-tertiary text-body border fw-medium">Quórum: {v.quorum_minimo ? `${v.quorum_minimo}% das unidades` : "não exigido"}</span>
            <span className="badge bg-body-tertiary text-body border fw-medium">{ROTULO_MAIORIA[v.maioria] ?? "Maioria simples"}</span>
            {v.fundamento && (
              <Link to="/documentos" className="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle fw-medium text-decoration-none">
                {v.fundamento}
              </Link>
            )}
          </div>
        </div>
        {admin && (
          <div className="d-flex flex-wrap gap-2">
            {dados.pode_editar && (
              <Link className="btn btn-outline-secondary" to={`/admin/votacoes/${v.id}/editar`}><Icone nome="lapis" tamanho={16} /> Editar</Link>
            )}
            <a className="btn btn-outline-secondary" href={`/api/admin/votacoes/${v.id}/ata.pdf`} target="_blank" rel="noreferrer"><Icone nome="pdf" tamanho={16} /> Ata em PDF</a>
            <a className="btn btn-outline-secondary" href={`/api/admin/votacoes/${v.id}/votos.csv`}><Icone nome="download" tamanho={16} /> Planilha</a>
            {v.estado === "aberta" && (
              <Button variant="danger" onClick={() => acao(
                { titulo: "Encerrar a votação agora?", texto: "Ninguém mais poderá votar e o resultado ficará visível para todos os moradores.", confirmar: "Encerrar votação", perigo: true },
                () => api.post(`/admin/votacoes/${v.id}/encerrar`))}>
                <Icone nome="parar" tamanho={16} /> Encerrar agora
              </Button>
            )}
            {total_votos === 0 && (
              <Button variant="outline-danger" onClick={() => acao(
                { titulo: "Excluir esta votação?", texto: "Essa ação não pode ser desfeita.", confirmar: "Excluir", perigo: true },
                () => api.del(`/admin/votacoes/${v.id}`), () => navegar("/admin"))}>
                <Icone nome="lixo" tamanho={16} /> Excluir
              </Button>
            )}
          </div>
        )}
      </div>

      {v.descricao && (
        <Card className="mb-4 shadow-sm"><Card.Body style={{ whiteSpace: "pre-line" }}>{v.descricao}</Card.Body></Card>
      )}

      <Row className="g-4">
        <Col lg={6}>
          <h2 className="h5 mb-3">Seu voto</h2>
          {minhas.length === 0 && <p className="vazio">Você não é o votante autorizado de nenhuma unidade.</p>}
          <div className="d-grid gap-3">
            {minhas.map((u) => (
              <CartaoVoto key={u.id} unidade={u} opcoes={opcoes} textos={textos} estado={v.estado}
                          votacaoId={v.id} aoVotar={recarregar} />
            ))}
          </div>
        </Col>

        <Col lg={6}>
          <h2 className="h5 mb-3">{!encerrada && resultado ? "Resultado parcial" : "Resultado"}</h2>
          {resultado ? (
            <Card className="shadow-sm mb-3">
              <Card.Body>
                {!encerrada && <p className="small text-body-secondary mb-3">Visível só para a administração até o encerramento.</p>}
                <GraficoResultado resultado={resultado} encerrada={encerrada} />
                <Table size="sm" className="mt-3 mb-0 small" aria-label="Resultado em tabela">
                  <thead><tr><th>Opção</th><th className="text-end">Votos</th><th className="text-end">%</th></tr></thead>
                  <tbody>
                    {resultado.itens.map((r) => (
                      <tr key={r.texto} className={encerrada && r.lider ? "fw-semibold" : ""}>
                        <td>{r.texto} {encerrada && r.lider && resultado.lideres.length === 1 && <Badge bg="warning" text="dark" className="ms-1">mais votada</Badge>}</td>
                        <td className="text-end tabular">{r.total}</td>
                        <td className="text-end tabular">{formataPct(r.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {encerrada && (
                  <div className={`apuracao mt-3 ${resultado.apuracao.situacao === "decidida" ? "decidida" : "alerta"}`}>
                    <Icone nome={resultado.apuracao.situacao === "decidida" ? "check" : "alerta"} tamanho={20} />
                    <div>
                      <strong className="d-block">{resultado.apuracao.situacao === "decidida" ? "Deliberação aprovada" : "Sem deliberação"}</strong>
                      <span className="small">{resultado.apuracao.texto}</span>
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>
          ) : (
            <Card className="shadow-sm mb-3">
              <Card.Body className="text-center text-body-secondary py-5">
                <Icone nome="grafico" tamanho={30} />
                <p className="mt-2 mb-0">O resultado aparece aqui assim que a votação for encerrada.</p>
              </Card.Body>
            </Card>
          )}

          <Card className="shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between small mb-2">
                <span className="fw-semibold">Participação</span>
                <span><strong>{total_votos}</strong> de {total_unidades} unidades · {formataPct(porcentagem(total_votos, total_unidades))}</span>
              </div>
              <div className="barra-quorum">
                <Barra parte={total_votos} todo={total_unidades} />
                {v.quorum_minimo > 0 && <span className="barra-quorum-marca" style={{ left: `${v.quorum_minimo}%` }} title={`Quórum mínimo: ${v.quorum_minimo}%`} />}
              </div>
              {v.quorum_minimo > 0 && (
                <p className={`small mt-2 mb-0 ${porcentagem(total_votos, total_unidades) >= v.quorum_minimo ? "text-success-emphasis" : "text-body-secondary"}`}>
                  {porcentagem(total_votos, total_unidades) >= v.quorum_minimo
                    ? "✓ Quórum mínimo atingido."
                    : `Faltam ${Math.max(0, Math.ceil((v.quorum_minimo * total_unidades) / 100) - total_votos)} unidade(s) para atingir o quórum de ${v.quorum_minimo}%.`}
                </p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {admin && (
        <>
          {v.estado !== "agendada" && (
            <section className="mt-5">
              <h2 className="h5 mb-3">Participação ao longo do prazo</h2>
              <Card className="shadow-sm">
                <Card.Body>
                  <GraficoParticipacao votacao={v} horarios={(dados.nominal ?? []).map((n) => n.data_hora)} totalUnidades={total_unidades} />
                  <p className="small text-body-secondary mt-2 mb-0">Unidades que já votaram, acumulado. O detalhe de cada voto está na tabela abaixo.</p>
                </Card.Body>
              </Card>
            </section>
          )}

          {v.estado !== "agendada" && (
            <section className="mt-5">
              <h2 className="h5 mb-3">Mapa da votação</h2>
              <MapaVotacao dados={dados} />
            </section>
          )}

          <section className="mt-5">
            <h2 className="h5 mb-3 d-flex align-items-center gap-2">Votos por unidade <span className="contador">{dados.nominal?.length ?? 0}</span></h2>
            {dados.nominal?.length ? (
              <Card className="shadow-sm overflow-hidden">
                <Table responsive hover className="mb-0 align-middle">
                  <thead><tr><th>Unidade</th><th>Votante</th><th>Escolha</th><th>Data e hora</th></tr></thead>
                  <tbody>
                    {dados.nominal.map((n) => (
                      <tr key={`${n.bloco}-${n.numero}`}>
                        <td><span className="unidade-tag">{n.bloco}-{n.numero}</span></td>
                        <td>{n.nome}</td><td>{n.opcao}</td><td className="text-nowrap tabular">{formataData(n.data_hora)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            ) : <p className="vazio">Nenhum voto registrado ainda.</p>}
          </section>

          {!!dados.pendentes?.length && (
            <section className="mt-5">
              <h2 className="h5 mb-3 d-flex align-items-center gap-2">
                {encerrada ? "Não votaram" : "Ainda não votaram"} <span className="contador">{dados.pendentes.length}</span>
              </h2>
              <div className="d-flex flex-wrap gap-2">
                {dados.pendentes.map((p) => (
                  <Badge key={`${p.bloco}-${p.numero}`} pill bg=""
                         className={`fw-normal fs-6 border ${p.votante ? "bg-body text-body" : "bg-warning-subtle text-warning-emphasis border-warning-subtle"}`}>
                    <strong>{p.bloco}-{p.numero}</strong> · {p.votante ?? "sem votante"}
                  </Badge>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function CartaoVoto({ unidade, opcoes, textos, estado, votacaoId, aoVotar }: {
  unidade: MinhaUnidade; opcoes: Opcao[]; textos: Record<number, string>;
  estado: string; votacaoId: number; aoVotar: () => void;
}) {
  const { avisar, confirmar } = useFeedback();
  const [escolha, setEscolha] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nome = `Bloco ${unidade.bloco} · Apto ${unidade.numero}`;

  const votar = async () => {
    if (escolha == null) return;
    const ok = await confirmar({
      titulo: `Confirmar voto "${textos[escolha]}"?`,
      texto: `Unidade ${nome}. Depois de confirmado, o voto não pode ser alterado.`,
      confirmar: "Confirmar voto",
    });
    if (!ok) return;
    setEnviando(true);
    try {
      const r = await api.post(`/votacoes/${votacaoId}/votar`, { unidade_id: unidade.id, opcao_id: escolha });
      avisar(r.mensagem ?? "Voto registrado.");
      aoVotar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
      setEnviando(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <div className="d-flex align-items-center gap-2 fw-semibold mb-3"><Icone nome="casa" /> {nome}</div>
        {unidade.opcao_votada ? (
          <div className="voto-registrado d-flex align-items-center gap-2 p-3">
            <span className="badge rounded-circle text-bg-success p-2"><Icone nome="check" tamanho={14} /></span>
            Voto registrado: <strong>{textos[unidade.opcao_votada]}</strong>
          </div>
        ) : estado === "aberta" ? (
          <>
            <div className="d-grid gap-2 mb-3" role="radiogroup" aria-label={`Opções de voto para ${nome}`}>
              {opcoes.map((o) => (
                <label key={o.id} className={`opcao-voto ${escolha === o.id ? "marcada" : ""}`}>
                  <Form.Check.Input type="radio" name={`voto-${unidade.id}`} value={o.id}
                                    checked={escolha === o.id} onChange={() => setEscolha(o.id)} />
                  <span>{o.texto}</span>
                </label>
              ))}
            </div>
            <Button className="w-100" size="lg" disabled={escolha == null || enviando} onClick={votar}>
              {enviando ? <><Spinner size="sm" animation="border" /> Registrando…</> : "Confirmar voto"}
            </Button>
            <p className="small text-body-secondary text-center mt-2 mb-0">Depois de confirmado, o voto não pode ser alterado.</p>
          </>
        ) : estado === "agendada" ? (
          <p className="text-body-secondary mb-0">A votação ainda não começou.</p>
        ) : (
          <p className="text-body-secondary mb-0">Esta unidade não votou.</p>
        )}
      </Card.Body>
    </Card>
  );
}
