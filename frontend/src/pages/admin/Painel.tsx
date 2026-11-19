import { Card, Col, ListGroup, Row, Table } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { GraficoParticipacaoVotacoes } from "../../components/Graficos";
import { Barra, Carregando, Contagem, ErroCarregar, Icone, Selo } from "../../components/ui";
import { formataData, formataPct, porcentagem } from "../../formato";
import { useApi } from "../../hooks";
import type { ResumoAdmin } from "../../tipos";

export default function Painel() {
  const { dados, erro, recarregar } = useApi<ResumoAdmin>("/admin/resumo");
  const navegar = useNavigate();

  if (erro && !dados) return <ErroCarregar mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;
  const { votacoes, stats } = dados;

  // participação média das votações já encerradas
  const encerradas = votacoes.filter((v) => v.estado === "encerrada");
  const media = encerradas.length && stats.unidades
    ? encerradas.reduce((s, v) => s + porcentagem(v.total_votos ?? 0, stats.unidades), 0) / encerradas.length
    : null;

  const numeros = [
    { rotulo: "Votações abertas", valor: String(stats.abertas), icone: "urna" },
    { rotulo: "Unidades", valor: String(stats.unidades), icone: "predio",
      dica: stats.sem_votante ? `${stats.sem_votante} sem votante` : "todas com votante", alerta: stats.sem_votante > 0 },
    { rotulo: "Moradores ativos", valor: String(stats.moradores), icone: "usuarios" },
    { rotulo: "Participação média", valor: media == null ? "–" : formataPct(media), icone: "grafico", dica: "nas votações encerradas" },
  ];

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="pagina-titulo">Painel do síndico</h1>
          <p className="text-body-secondary mb-0">As votações abrem e encerram sozinhas nos horários definidos.</p>
        </div>
        <Link className="btn btn-primary" to="/admin/votacoes/nova"><Icone nome="mais" /> Nova votação</Link>
      </div>

      <PrimeirosPassos stats={stats} temVotacao={votacoes.length > 0} />

      {stats.sem_votante > 0 && (
        <div className="alert alert-warning d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span><strong>{stats.sem_votante}</strong> {stats.sem_votante > 1 ? "unidades estão" : "unidade está"} sem votante e não {stats.sem_votante > 1 ? "podem" : "pode"} votar.</span>
          <Link to="/admin/unidades" className="alert-link">Resolver agora →</Link>
        </div>
      )}

      <Row xs={2} lg={4} className="g-3 mb-4">
        {numeros.map((n) => (
          <Col key={n.rotulo}>
            <Card className={`numero-card h-100 ${n.alerta ? "alerta" : ""}`}>
              <Card.Body>
                <span className="numero-icone d-none d-sm-inline-grid"><Icone nome={n.icone} tamanho={20} /></span>
                <div className="min-w-0">
                  <div className="small text-body-secondary fw-medium">{n.rotulo}</div>
                  <strong>{n.valor}</strong>
                  {n.dica && <div className={`small ${n.alerta ? "text-warning-emphasis fw-medium" : "text-body-secondary"}`}>{n.dica}</div>}
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {votacoes.length > 0 && (
        <Card className="shadow-sm mb-4">
          <Card.Body>
            <h2 className="h6 mb-1">Participação por votação</h2>
            <p className="small text-body-secondary mb-3">Percentual de unidades que votaram, nas votações mais recentes.</p>
            <GraficoParticipacaoVotacoes votacoes={votacoes} totalUnidades={stats.unidades} />
          </Card.Body>
        </Card>
      )}

      <section>
        <h2 className="h5 mb-3">Votações</h2>
        {votacoes.length ? (
          <Card className="shadow-sm overflow-hidden">
            <Table responsive hover className="mb-0 align-middle">
              <thead>
                <tr><th>Pauta</th><th>Situação</th><th>Período</th><th style={{ minWidth: 150 }}>Participação</th></tr>
              </thead>
              <tbody>
                {votacoes.map((v) => (
                  <tr key={v.id} role="button" onClick={() => navegar(`/votacoes/${v.id}`)}>
                    <td><Link className="fw-semibold link-body-emphasis" to={`/votacoes/${v.id}`} onClick={(e) => e.stopPropagation()}>{v.titulo}</Link></td>
                    <td><div className="d-flex flex-column align-items-start gap-1"><Selo estado={v.estado} /><Contagem votacao={v} aoTerminar={recarregar} /></div></td>
                    <td className="text-nowrap small">{formataData(v.data_inicio)}<br /><span className="text-body-secondary">até {formataData(v.data_fim)}</span></td>
                    <td>
                      <div className="small mb-1 tabular">{v.total_votos}/{stats.unidades} · {formataPct(porcentagem(v.total_votos ?? 0, stats.unidades))}</div>
                      <Barra parte={v.total_votos ?? 0} todo={stats.unidades} fina />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : (
          <div className="vazio">
            <p className="mb-3">Nenhuma votação criada ainda.</p>
            <Link className="btn btn-primary" to="/admin/votacoes/nova">Criar a primeira votação</Link>
          </div>
        )}
      </section>
    </>
  );
}

/** Roteiro de configuração exibido até o condomínio estar pronto para a primeira votação. */
function PrimeirosPassos({ stats, temVotacao }: { stats: ResumoAdmin["stats"]; temVotacao: boolean }) {
  const passos = [
    { feito: stats.unidades > 0, titulo: "Cadastre as unidades", texto: "Bloco e número de cada apartamento.", link: "/admin/unidades" },
    { feito: stats.moradores > 1, titulo: "Cadastre os moradores", texto: "Nome, CPF, e-mail e uma senha inicial para cada um.", link: "/admin/moradores" },
    { feito: stats.unidades > 0 && stats.sem_votante === 0, titulo: "Vincule proprietários e votantes",
      texto: "Cada unidade precisa de um votante: o proprietário ou alguém indicado por ele.", link: "/admin/unidades" },
    { feito: temVotacao, titulo: "Crie a primeira votação", texto: "Defina a pauta, as opções e o período.", link: "/admin/votacoes/nova" },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;

  return (
    <Card className="mb-4 border-primary-subtle">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
          <div>
            <h2 className="h5 mb-1">Primeiros passos</h2>
            <p className="text-body-secondary small mb-0">Deixe o condomínio pronto para votar. Lembre-se de trocar a senha inicial no menu da sua conta.</p>
          </div>
          <span className="badge bg-body-tertiary text-body-secondary border font-monospace">{feitos} de {passos.length}</span>
        </div>
        <ListGroup variant="flush">
          {passos.map((p) => (
            <ListGroup.Item key={p.titulo} className={`d-flex flex-wrap align-items-center gap-3 px-0 bg-transparent ${p.feito ? "feito" : ""}`}>
              <span className="passo-marca" aria-label={p.feito ? "Concluído" : "Pendente"}>{p.feito ? "✓" : ""}</span>
              <div className="flex-grow-1 min-w-0">
                <strong className="d-block">{p.titulo}</strong>
                <span className="small text-body-secondary">{p.texto}</span>
              </div>
              {!p.feito && <Link className="btn btn-sm btn-outline-primary" to={p.link}>Fazer agora</Link>}
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Card.Body>
    </Card>
  );
}
