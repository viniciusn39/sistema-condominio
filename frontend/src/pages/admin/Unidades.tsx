import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Col, Collapse, Form, Nav, Row } from "react-bootstrap";
import { api, mensagemDeErro, type RespostaOk } from "../../api";
import { useFeedback } from "../../components/Feedback";
import { Carregando, ErroCarregar, Icone } from "../../components/ui";
import { useApi } from "../../hooks";
import type { Pessoa, Unidade } from "../../tipos";

export default function Unidades() {
  const { dados, erro, recarregar } = useApi<{ unidades: Unidade[]; moradores: Pessoa[] }>("/admin/unidades");
  const { avisar } = useFeedback();
  const [nova, setNova] = useState({ bloco: "", numero: "" });
  const [filtro, setFiltro] = useState<"todas" | "sem">("todas");

  if (erro && !dados) return <ErroCarregar mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;

  const semVotante = dados.unidades.filter((u) => !u.votante).length;
  const lista = filtro === "sem" ? dados.unidades.filter((u) => !u.votante) : dados.unidades;

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post("/admin/unidades", nova);
      avisar(r.mensagem ?? "Unidade cadastrada.");
      setNova({ bloco: nova.bloco, numero: "" });
      recarregar();
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    }
  };

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="pagina-titulo">Unidades</h1>
          <p className="text-body-secondary mb-0">Cada unidade tem um único votante: um proprietário ou um representante indicado por ele.</p>
        </div>
        <Link to="/admin/importar" className="btn btn-outline-secondary"><Icone nome="upload" tamanho={16} /> Importar planilha</Link>
      </div>

      <Card className="shadow-sm mb-4">
        <Card.Body>
          <Form onSubmit={criar}>
            <Row className="g-3 align-items-end">
              <Col xs={6} md={3}>
                <Form.Group controlId="bloco"><Form.Label>Bloco</Form.Label>
                  <Form.Control required maxLength={10} placeholder="A" value={nova.bloco}
                                onChange={(e) => setNova({ ...nova, bloco: e.target.value })} /></Form.Group>
              </Col>
              <Col xs={6} md={3}>
                <Form.Group controlId="numero"><Form.Label>Apartamento</Form.Label>
                  <Form.Control required maxLength={10} placeholder="101" value={nova.numero}
                                onChange={(e) => setNova({ ...nova, numero: e.target.value })} /></Form.Group>
              </Col>
              <Col xs={12} md="auto">
                <Button type="submit" className="w-100"><Icone nome="mais" /> Cadastrar unidade</Button>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      <Nav variant="underline" activeKey={filtro} onSelect={(k) => setFiltro(k as "todas" | "sem")} className="mb-3">
        <Nav.Item><Nav.Link eventKey="todas">Todas <span className="contador ms-1">{dados.unidades.length}</span></Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="sem">Sem votante <Badge bg={semVotante ? "warning" : "secondary"} text={semVotante ? "dark" : undefined} pill className="ms-1">{semVotante}</Badge></Nav.Link></Nav.Item>
      </Nav>

      <div className="d-grid gap-2">
        {lista.map((u) => <ItemUnidade key={u.id} u={u} moradores={dados.moradores} aoMudar={recarregar} />)}
        {!lista.length && <p className="vazio">{filtro === "sem" ? "Todas as unidades têm votante." : "Nenhuma unidade cadastrada."}</p>}
      </div>
    </>
  );
}

function ItemUnidade({ u, moradores, aoMudar }: { u: Unidade; moradores: Pessoa[]; aoMudar: () => void }) {
  const { avisar, confirmar } = useFeedback();
  const [aberto, setAberto] = useState(false);
  const [dono, setDono] = useState("");
  const [votante, setVotante] = useState("");
  const [indicadoPor, setIndicadoPor] = useState("");
  const nome = `${u.bloco}-${u.numero}`;
  const votanteEhDono = u.proprietarios.some((p) => String(p.id) === votante);

  const executa = async (fn: () => Promise<RespostaOk>) => {
    try {
      const r = await fn();
      avisar(r.mensagem ?? "Feito.");
      aoMudar();
      return true;
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
      return false;
    }
  };

  const adicionarDono = async (e: FormEvent) => {
    e.preventDefault();
    if (await executa(() => api.post(`/admin/unidades/${u.id}/proprietarios`, { usuario_id: Number(dono) }))) setDono("");
  };

  const definirVotante = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await executa(() => api.post(`/admin/unidades/${u.id}/votante`, {
      usuario_id: Number(votante), indicado_por: votanteEhDono ? null : Number(indicadoPor) || null,
    }));
    if (ok) { setVotante(""); setIndicadoPor(""); }
  };

  const removerDono = async (p: Pessoa) => {
    if (await confirmar({ titulo: `Remover ${p.nome} de ${nome}?`,
      texto: "Se essa pessoa (ou alguém indicado por ela) vota pela unidade, a unidade ficará sem votante.",
      confirmar: "Remover", perigo: true })) {
      executa(() => api.del(`/admin/unidades/${u.id}/proprietarios/${p.id}`));
    }
  };

  const excluir = async () => {
    if (await confirmar({ titulo: `Excluir a unidade ${nome}?`, confirmar: "Excluir", perigo: true })) {
      executa(() => api.del(`/admin/unidades/${u.id}`));
    }
  };

  return (
    <Card className={`shadow-sm ${u.votante ? "" : "item-alerta"}`}>
      <Card.Body className="d-flex flex-wrap align-items-center gap-3 py-3">
        <span className="unidade-tag grande">{nome}</span>
        <div className="flex-grow-1 min-w-0 small">
          <div className="mb-1">
            <span className="text-body-secondary me-1">Proprietários:</span>
            {u.proprietarios.length
              ? u.proprietarios.map((p) => <Badge key={p.id} pill bg="" className="bg-body-tertiary text-body border fw-normal me-1">{p.nome}</Badge>)
              : <span className="text-body-secondary">nenhum</span>}
          </div>
          <div>
            <span className="text-body-secondary me-1">Votante:</span>
            {u.votante ? (
              <><strong>{u.votante.nome}</strong>
                {u.votante.tipo === "representante" && <span className="text-body-secondary"> · representante indicado por {u.votante.indicado_por}</span>}</>
            ) : <span className="text-warning-emphasis fw-semibold">sem votante, esta unidade não pode votar</span>}
          </div>
        </div>
        <Button variant="outline-secondary" size="sm" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
          {aberto ? "Fechar" : "Gerenciar"}
        </Button>
      </Card.Body>

      <Collapse in={aberto}>
        <div>
          <div className="gerenciar p-3 p-md-4 rounded-bottom">
            <Row className="g-4">
              <Col md={6}>
                <Form onSubmit={adicionarDono}>
                  <Form.Group controlId={`dono-${u.id}`} className="mb-2">
                    <Form.Label>Adicionar proprietário</Form.Label>
                    <Form.Select required value={dono} onChange={(e) => setDono(e.target.value)}>
                      <option value="">Escolha um morador…</option>
                      {moradores.filter((m) => !u.proprietarios.some((p) => p.id === m.id))
                        .map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </Form.Select>
                  </Form.Group>
                  <Button type="submit" variant="outline-primary" size="sm">Adicionar</Button>
                </Form>
              </Col>
              <Col md={6}>
                <Form onSubmit={definirVotante}>
                  <Form.Group controlId={`votante-${u.id}`} className="mb-2">
                    <Form.Label>Quem vota pela unidade</Form.Label>
                    <Form.Select required value={votante} onChange={(e) => setVotante(e.target.value)}>
                      <option value="">Escolha um morador…</option>
                      {moradores.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </Form.Select>
                  </Form.Group>
                  {votante && !votanteEhDono && (
                    <Form.Group controlId={`indicado-${u.id}`} className="mb-2">
                      <Form.Label>Indicado por qual proprietário?</Form.Label>
                      <Form.Select required value={indicadoPor} onChange={(e) => setIndicadoPor(e.target.value)}
                                   disabled={!u.proprietarios.length}>
                        <option value="">{u.proprietarios.length ? "Escolha…" : "Cadastre um proprietário primeiro"}</option>
                        {u.proprietarios.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </Form.Select>
                    </Form.Group>
                  )}
                  <Button type="submit" variant="outline-primary" size="sm">Definir votante</Button>
                </Form>
              </Col>
            </Row>
            <hr />
            <div className="d-flex flex-wrap gap-2">
              {u.proprietarios.map((p) => (
                <Button key={p.id} variant="outline-danger" size="sm" onClick={() => removerDono(p)}>
                  Remover {p.nome.split(" ")[0]}
                </Button>
              ))}
              <Button variant="outline-danger" size="sm" className="ms-auto" onClick={excluir}>
                <Icone nome="lixo" tamanho={15} /> Excluir unidade
              </Button>
            </div>
          </div>
        </div>
      </Collapse>
    </Card>
  );
}
