import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Col, Form, Modal, Nav, ProgressBar, Row, Spinner } from "react-bootstrap";
import { api, mensagemDeErro } from "../api";
import { useAuth } from "../auth";
import { useFeedback } from "../components/Feedback";
import { EVENTO_AVISOS } from "../components/Layout";
import { Carregando, ErroCarregar, Icone } from "../components/ui";
import { formataData, iniciais } from "../formato";
import { useApi } from "../hooks";
import type { Aviso, ListaAvisos } from "../tipos";

const COR_CATEGORIA: Record<string, string> = {
  geral: "secondary", manutencao: "warning", assembleia: "primary", seguranca: "danger", financeiro: "success", obras: "info",
};

export default function Avisos() {
  const { usuario } = useAuth();
  const { dados, erro, recarregar } = useApi<ListaAvisos>("/avisos");
  const [filtro, setFiltro] = useState("todos");
  const [editando, setEditando] = useState<Aviso | "novo" | null>(null);
  const [leiturasDe, setLeiturasDe] = useState<Aviso | null>(null);

  if (erro && !dados) return <ErroCarregar mensagem={erro} tentar={recarregar} />;
  if (!dados || !usuario) return <Carregando />;
  const admin = usuario.perfil === "admin";
  const { avisos, categorias } = dados;
  const lista = filtro === "todos" ? avisos : avisos.filter((a) => a.categoria === filtro);
  const usadas = Object.keys(categorias).filter((c) => avisos.some((a) => a.categoria === c));

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="pagina-titulo">Mural de avisos</h1>
          <p className="text-body-secondary mb-0">
            {admin ? "Comunicados para todos os moradores. Em cada aviso você vê quem já viu e quem ainda não viu."
                   : "Comunicados da administração do condomínio."}
          </p>
        </div>
        {admin && <Button onClick={() => setEditando("novo")}><Icone nome="mais" /> Novo aviso</Button>}
      </div>

      {usadas.length > 1 && (
        <Nav variant="pills" activeKey={filtro} onSelect={(k) => setFiltro(k ?? "todos")} className="gap-1 mb-3 small">
          <Nav.Item><Nav.Link eventKey="todos" className="py-1 px-3">Todos</Nav.Link></Nav.Item>
          {usadas.map((c) => <Nav.Item key={c}><Nav.Link eventKey={c} className="py-1 px-3">{categorias[c]}</Nav.Link></Nav.Item>)}
        </Nav>
      )}

      <div className="d-grid gap-3" style={{ maxWidth: 860 }}>
        {lista.map((a) => (
          <CartaoAviso key={a.id} a={a} categorias={categorias} admin={admin} aoMudar={recarregar}
                       aoEditar={() => setEditando(a)} aoVerLeituras={() => setLeiturasDe(a)} />
        ))}
        {!lista.length && (
          <div className="vazio">
            <Icone nome="sino" tamanho={28} />
            <p className="mt-2 mb-0">{admin ? "Nenhum aviso publicado. Use o botão “Novo aviso” para falar com os moradores." : "Nenhum aviso por enquanto."}</p>
          </div>
        )}
      </div>

      {editando && (
        <FormAviso aviso={editando === "novo" ? null : editando} categorias={categorias}
                   aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); recarregar(); }} />
      )}
      {leiturasDe && <Leituras aviso={leiturasDe} aoFechar={() => setLeiturasDe(null)} />}
    </>
  );
}

/**
 * Marca o aviso como visto quando ele aparece de verdade na tela: pelo menos 60% dele (ou meia tela,
 * se for um aviso comprido) visível por pouco mais de 1 segundo. O destaque "Novo" continua nesta visita.
 */
function useMarcaVisto(a: Aviso) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (a.lido || !el || typeof IntersectionObserver === "undefined") return;
    let timer: number | undefined;
    const obs = new IntersectionObserver(([e]) => {
      const visivel = e.intersectionRatio >= 0.6 || e.intersectionRect.height >= window.innerHeight * 0.5;
      if (visivel && timer === undefined) {
        timer = window.setTimeout(() => {
          obs.disconnect();
          api.post(`/avisos/${a.id}/lido`).then(() => window.dispatchEvent(new Event(EVENTO_AVISOS))).catch(() => {});
        }, 1200);
      } else if (!visivel && timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    }, { threshold: [0, 0.25, 0.5, 0.6, 0.8, 1] });
    obs.observe(el);
    return () => { obs.disconnect(); window.clearTimeout(timer); };
  }, [a.id, a.lido]);
  return ref;
}

function CartaoAviso({ a, categorias, admin, aoMudar, aoEditar, aoVerLeituras }: {
  a: Aviso; categorias: Record<string, string>; admin: boolean;
  aoMudar: () => void; aoEditar: () => void; aoVerLeituras: () => void;
}) {
  const { avisar, confirmar } = useFeedback();
  const ref = useMarcaVisto(a);
  const cor = COR_CATEGORIA[a.categoria] ?? "secondary";

  const executar = async (fn: () => Promise<{ mensagem?: string }>) => {
    try {
      const r = await fn();
      avisar(r.mensagem ?? "Feito.");
      aoMudar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  };

  return (
    <Card ref={ref} className={`aviso ${a.lido ? "" : "novo"} ${a.fixado ? "fixado border-primary-subtle" : ""}`}>
      <Card.Body>
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <span className={`aviso-categoria text-${cor}-emphasis`}>{categorias[a.categoria] ?? a.categoria}</span>
          {a.fixado && <Badge bg="" className="bg-primary-subtle text-primary-emphasis d-inline-flex align-items-center gap-1"><Icone nome="pino" tamanho={12} /> Fixado</Badge>}
          {!a.lido && <Badge bg="primary">Novo</Badge>}
          <span className="ms-auto small text-body-secondary">{formataData(a.criado_em)}</span>
        </div>
        <h2 className="h5 mb-2">{a.titulo}</h2>
        <p className="aviso-texto mb-3">{a.texto}</p>
        {admin && a.total_moradores !== undefined && <VistoPor a={a} aoVer={aoVerLeituras} />}
        <div className="d-flex flex-wrap align-items-center gap-2 small text-body-secondary">
          <span>Publicado por {a.autor}{a.editado_em && ` · editado em ${formataData(a.editado_em)}`}</span>
          {admin && (
            <div className="ms-auto d-flex flex-wrap gap-1">
              <Button size="sm" variant="outline-secondary" onClick={() => executar(() => api.post(`/admin/avisos/${a.id}/fixar`))}>
                <Icone nome="pino" tamanho={14} /> {a.fixado ? "Desafixar" : "Fixar"}
              </Button>
              <Button size="sm" variant="outline-secondary" onClick={aoEditar}><Icone nome="lapis" tamanho={14} /> Editar</Button>
              <Button size="sm" variant="outline-danger" aria-label="Excluir aviso" onClick={async () => {
                if (await confirmar({ titulo: "Excluir este aviso?", texto: "Ele some do mural de todos os moradores.", confirmar: "Excluir", perigo: true })) {
                  executar(() => api.del(`/admin/avisos/${a.id}`));
                }
              }}><Icone nome="lixo" tamanho={14} /></Button>
            </div>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}

/** Resumo para o síndico: quantos já viram, iniciais das primeiras pessoas e atalho para a lista. */
function VistoPor({ a, aoVer }: { a: Aviso; aoVer: () => void }) {
  const total = a.total_moradores ?? 0;
  const vistos = a.leituras ?? 0;
  const pct = total ? Math.round((100 * vistos) / total) : 0;
  const nomes = a.quem_viu ?? [];
  return (
    <button type="button" className="aviso-visto mb-3" onClick={aoVer} aria-label={`Visto por ${vistos} de ${total}. Ver quem viu.`}>
      <span className="avatares" aria-hidden>
        {nomes.map((n) => <span key={n} className="avatar-mini" title={n}>{iniciais(n)}</span>)}
        {vistos > nomes.length && <span className="avatar-mini mais">+{vistos - nomes.length}</span>}
        {!vistos && <span className="avatar-mini vazio"><Icone nome="relogio" tamanho={12} /></span>}
      </span>
      <span className="flex-grow-1 text-start">
        <span className="d-flex flex-wrap justify-content-between gap-2 small">
          <span><strong className="tabular">Visto por {vistos}</strong> <span className="text-body-secondary">de {total} {total === 1 ? "pessoa" : "pessoas"}</span></span>
          <span className="text-primary fw-semibold">Ver quem viu →</span>
        </span>
        <ProgressBar now={pct} className="mt-1" style={{ height: 6 }} />
      </span>
    </button>
  );
}

function FormAviso({ aviso, categorias, aoFechar, aoSalvar }: {
  aviso: Aviso | null; categorias: Record<string, string>; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { avisar } = useFeedback();
  const [f, setF] = useState({
    titulo: aviso?.titulo ?? "", texto: aviso?.texto ?? "", categoria: aviso?.categoria ?? "geral", fixado: aviso?.fixado ?? false,
  });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = aviso ? await api.put(`/admin/avisos/${aviso.id}`, f) : await api.post("/admin/avisos", f);
      avisar(r.mensagem ?? "Salvo.");
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setEnviando(false);
    }
  };

  return (
    <Modal show onHide={aoFechar} size="lg" centered>
      <Form onSubmit={enviar}>
        <Modal.Header closeButton><Modal.Title className="h5">{aviso ? "Editar aviso" : "Novo aviso"}</Modal.Title></Modal.Header>
        <Modal.Body>
          {erro && <Alert variant="danger" className="py-2">{erro}</Alert>}
          <Row className="g-3">
            <Col md={8}>
              <Form.Group controlId="aviso-titulo">
                <Form.Label>Título</Form.Label>
                <Form.Control required maxLength={120} autoFocus value={f.titulo} placeholder="Ex.: Manutenção do elevador"
                              onChange={(e) => setF({ ...f, titulo: e.target.value })} />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="aviso-categoria">
                <Form.Label>Categoria</Form.Label>
                <Form.Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
                  {Object.entries(categorias).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col xs={12}>
              <Form.Group controlId="aviso-texto">
                <Form.Label>Mensagem</Form.Label>
                <Form.Control as="textarea" rows={7} required maxLength={5000} value={f.texto}
                              placeholder="Escreva o comunicado. Datas, horários e o que o morador precisa fazer."
                              onChange={(e) => setF({ ...f, texto: e.target.value })} />
              </Form.Group>
            </Col>
            <Col xs={12}>
              <Form.Check type="switch" id="aviso-fixado" label="Fixar no topo do mural"
                          checked={f.fixado} onChange={(e) => setF({ ...f, fixado: e.target.checked })} />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" disabled={enviando}>{enviando ? "Salvando…" : aviso ? "Salvar alterações" : "Publicar aviso"}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

interface ListaLeituras {
  lidos: { nome: string; lido_em: string; unidades: string | null }[];
  nao_lidos: { nome: string; unidades: string | null; ultimo_acesso: string | null }[];
}

const tagsUnidades = (u: string | null) =>
  u ? u.split(",").map((x) => <span key={x} className="unidade-tag me-1">{x}</span>) : <span className="text-body-secondary">sem unidade</span>;

function Leituras({ aviso, aoFechar }: { aviso: Aviso; aoFechar: () => void }) {
  const { dados, erro } = useApi<ListaLeituras>(`/admin/avisos/${aviso.id}/leituras`);
  const { avisar } = useFeedback();
  const [aba, setAba] = useState<"viram" | "faltam">("faltam");

  const copiarPendentes = async () => {
    if (!dados) return;
    const texto = `Ainda não viram o aviso “${aviso.titulo}”:\n` +
      dados.nao_lidos.map((n) => `- ${n.nome}${n.unidades ? ` (${n.unidades.replace(/,/g, ", ")})` : ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Lista copiada. Cole no WhatsApp ou no e-mail para lembrar os moradores.");
    } catch {
      avisar("Não foi possível copiar automaticamente.", "erro");
    }
  };

  return (
    <Modal show onHide={aoFechar} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title className="h5">Quem viu o aviso<div className="small fw-normal text-body-secondary text-truncate">{aviso.titulo}</div></Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {erro && <Alert variant="danger">{erro}</Alert>}
        {!dados ? <div className="text-center py-4"><Spinner size="sm" /></div> : (
          <>
            <Nav variant="underline" activeKey={aba} onSelect={(k) => setAba(k as "viram" | "faltam")} className="mb-3">
              <Nav.Item><Nav.Link eventKey="faltam">Ainda não viram <span className="contador ms-1">{dados.nao_lidos.length}</span></Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="viram">Já viram <span className="contador ms-1">{dados.lidos.length}</span></Nav.Link></Nav.Item>
            </Nav>
            {aba === "viram" ? (
              dados.lidos.length ? (
                <ul className="list-unstyled small mb-0">
                  {dados.lidos.map((l) => (
                    <li key={l.nome} className="d-flex align-items-center gap-2 border-bottom py-2">
                      <span className="avatar-mini">{iniciais(l.nome)}</span>
                      <span className="flex-grow-1 min-w-0"><span className="d-block fw-medium">{l.nome}</span>{tagsUnidades(l.unidades)}</span>
                      <span className="text-body-secondary tabular text-end"><Icone nome="check" tamanho={13} /> {formataData(l.lido_em)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="small text-body-secondary mb-0">Ninguém viu este aviso ainda.</p>
            ) : (
              dados.nao_lidos.length ? (
                <>
                  <ul className="list-unstyled small mb-3">
                    {dados.nao_lidos.map((n) => (
                      <li key={n.nome} className="d-flex align-items-center gap-2 border-bottom py-2">
                        <span className="avatar-mini vazio">{iniciais(n.nome)}</span>
                        <span className="flex-grow-1 min-w-0"><span className="d-block fw-medium">{n.nome}</span>{tagsUnidades(n.unidades)}</span>
                        {!n.ultimo_acesso && <Badge bg="" className="bg-warning-subtle text-warning-emphasis fw-normal">nunca entrou no sistema</Badge>}
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="outline-primary" onClick={copiarPendentes}>Copiar lista para cobrar</Button>
                </>
              ) : <p className="small text-success-emphasis mb-0"><Icone nome="check" tamanho={14} /> Todos já viram este aviso.</p>
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
