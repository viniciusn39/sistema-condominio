import { Card, Col, Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { GraficoParticipacaoVotacoes, GraficoResultado } from "../components/Graficos";
import { Barra, Carregando, Contagem, ErroCarregar, Icone, Selo } from "../components/ui";
import { formataData, formataPct, primeiroNome } from "../formato";
import { useApi } from "../hooks";
import type { ListaAvisos, ListaVotacoes, Votacao } from "../tipos";

export default function Votacoes() {
  const { usuario } = useAuth();
  const { dados, erro, recarregar } = useApi<ListaVotacoes>("/votacoes");
  const { dados: mural } = useApi<ListaAvisos>("/avisos");
  const novos = (mural?.avisos ?? []).filter((a) => !a.lido).slice(0, 2);

  if (erro && !dados) return <ErroCarregar mensagem={erro} tentar={recarregar} />;
  if (!dados || !usuario) return <Carregando />;

  const { votacoes, n_unidades, total_unidades, painel } = dados;
  const abertas = votacoes.filter((v) => v.estado === "aberta").sort((a, b) => a.data_fim.localeCompare(b.data_fim));
  const agendadas = votacoes.filter((v) => v.estado === "agendada").sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  const encerradas = votacoes.filter((v) => v.estado === "encerrada");
  const pendentes = abertas.filter((v) => (v.meus_votos ?? 0) < n_unidades).length;

  const grade = (lista: Votacao[]) => (
    <Row xs={1} md={2} xl={3} className="g-3">
      {lista.map((v) => (
        <Col key={v.id}><Cartao v={v} nUnidades={n_unidades} totalUnidades={total_unidades} aoMudar={recarregar} /></Col>
      ))}
    </Row>
  );

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="pagina-titulo">Olá, {primeiroNome(usuario.nome)}</h1>
          <p className="text-body-secondary mb-0">
            {n_unidades
              ? `Você vota por ${n_unidades} unidade${n_unidades > 1 ? "s" : ""}.` +
                (pendentes ? ` ${pendentes} ${pendentes > 1 ? "votações aguardam" : "votação aguarda"} o seu voto.` : "")
              : "Você não está cadastrado(a) como votante de nenhuma unidade. Fale com o síndico se isso estiver errado."}
          </p>
        </div>
        {usuario.perfil === "admin" && (
          <Link className="btn btn-primary" to="/admin/votacoes/nova"><Icone nome="mais" /> Nova votação</Link>
        )}
      </div>

      {novos.length > 0 && (
        <Card className="mb-4 border-primary-subtle">
          <Card.Body className="d-flex flex-wrap align-items-start gap-3">
            <span className="numero-icone"><Icone nome="sino" tamanho={20} /></span>
            <div className="flex-grow-1 min-w-0">
              <div className="small text-primary-emphasis fw-semibold mb-1">
                {mural!.nao_lidos > 1 ? `${mural!.nao_lidos} avisos novos no mural` : "Aviso novo no mural"}
              </div>
              {novos.map((a) => (
                <div key={a.id} className="mb-1"><strong>{a.titulo}</strong> <span className="small text-body-secondary">· {formataData(a.criado_em)}</span></div>
              ))}
            </div>
            <Link to="/avisos" className="btn btn-sm btn-primary">Ler avisos</Link>
          </Card.Body>
        </Card>
      )}

      <Painel painel={painel} votacoes={votacoes} totalUnidades={total_unidades}
              nAbertas={abertas.length} pendentes={pendentes} votante={n_unidades > 0} />

      <Secao titulo="Abertas agora" n={abertas.length}>
        {abertas.length ? grade(abertas) : <p className="vazio mb-0">Nenhuma votação aberta no momento.</p>}
      </Secao>
      {agendadas.length > 0 && <Secao titulo="Próximas" n={agendadas.length}>{grade(agendadas)}</Secao>}
      <Secao titulo="Encerradas" n={encerradas.length}>
        {encerradas.length ? grade(encerradas) : <p className="vazio mb-0">Nenhuma votação encerrada ainda.</p>}
      </Secao>
    </>
  );
}

function Painel({ painel, votacoes, totalUnidades, nAbertas, pendentes, votante }: {
  painel: ListaVotacoes["painel"]; votacoes: Votacao[]; totalUnidades: number;
  nAbertas: number; pendentes: number; votante: boolean;
}) {
  const indicadores = [
    { icone: "urna", rotulo: "Abertas agora", valor: String(nAbertas),
      dica: !votante ? "" : pendentes ? `${pendentes} aguardando seu voto` : nAbertas ? "você já votou em todas" : "nenhuma em andamento",
      alerta: pendentes > 0 },
    { icone: "check", rotulo: "Sua participação", valor: votante || painel.participei ? `${painel.participei} de ${painel.encerradas}` : "–",
      dica: "votações encerradas" },
    { icone: "usuarios", rotulo: "Participação média", valor: painel.participacao_media == null ? "–" : formataPct(painel.participacao_media),
      dica: "das unidades, nas encerradas" },
    { icone: "documento", rotulo: "Decisões aprovadas", valor: `${painel.decididas} de ${painel.encerradas}`,
      dica: "com quórum e maioria" },
  ];
  const ultima = painel.ultima;
  const ap = ultima?.resultado.apuracao;

  return (
    <section className="mb-5">
      <Row xs={2} xl={4} className="g-3 mb-3">
        {indicadores.map((n) => (
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

      <Row className="g-3">
        <Col lg={7}>
          <Card className="h-100">
            <Card.Body>
              <h2 className="h6 mb-1">Participação por votação</h2>
              <p className="small text-body-secondary mb-3">Percentual das {totalUnidades} unidades que votaram em cada pauta.</p>
              <GraficoParticipacaoVotacoes votacoes={votacoes} totalUnidades={totalUnidades} />
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="h-100">
            <Card.Body className="d-flex flex-column">
              <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                <h2 className="h6 mb-0">Último resultado</h2>
                {ultima && <Link to={`/votacoes/${ultima.id}`} className="small text-nowrap">Ver votação →</Link>}
              </div>
              {ultima && ap ? (
                <>
                  <p className="small text-body-secondary mb-3">{ultima.titulo} · encerrada em {formataData(ultima.data_fim)}</p>
                  <GraficoResultado resultado={ultima.resultado} encerrada />
                  <div className={`apuracao mt-auto ${ap.situacao === "decidida" ? "decidida" : "alerta"}`} style={{ marginTop: "1rem" }}>
                    <Icone nome={ap.situacao === "decidida" ? "check" : "alerta"} tamanho={18} />
                    <span className="small">
                      <strong>{ap.situacao === "decidida" ? `Aprovado: ${ap.vencedora}` : "Sem deliberação"}</strong>
                      {" · "}participação de {formataPct(ap.participacao)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center text-body-secondary my-auto py-4">
                  <Icone nome="grafico" tamanho={28} />
                  <p className="small mt-2 mb-0">O resultado aparece aqui quando a primeira votação for encerrada.</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </section>
  );
}

function Secao({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="h5 mb-3 d-flex align-items-center gap-2">{titulo} <span className="contador">{n}</span></h2>
      {children}
    </section>
  );
}

function Cartao({ v, nUnidades, totalUnidades, aoMudar }:
  { v: Votacao; nUnidades: number; totalUnidades: number; aoMudar: () => void }) {
  const votou = (v.meus_votos ?? 0) >= nUnidades;
  return (
    <Card as={Link} to={`/votacoes/${v.id}`} className={`cartao-votacao shadow-sm shadow-hover ${v.estado}`}>
      <Card.Body className="d-flex flex-column">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <Selo estado={v.estado} />
          <Contagem votacao={v} aoTerminar={aoMudar} />
        </div>
        <h3 className="mb-1">{v.titulo}</h3>
        <p className="small text-body-secondary mb-3">{formataData(v.data_inicio)} → {formataData(v.data_fim)}</p>
        <div className="mt-auto">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 small mb-2">
            <span className="text-body-secondary">{v.total_votos} de {totalUnidades} unidades votaram</span>
            {v.estado === "aberta" && nUnidades > 0 && (
              votou ? <span className="text-success fw-semibold d-inline-flex align-items-center gap-1"><Icone nome="check" tamanho={14} /> Você já votou</span>
                    : <span className="text-warning-emphasis fw-semibold">Voto pendente</span>
            )}
          </div>
          <Barra parte={v.total_votos ?? 0} todo={totalUnidades} fina />
        </div>
      </Card.Body>
    </Card>
  );
}
