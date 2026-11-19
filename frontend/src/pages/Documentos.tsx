import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Col, Form, Modal, Nav, Row } from "react-bootstrap";
import { api, enviarArquivo, mensagemDeErro } from "../api";
import { useAuth } from "../auth";
import { useFeedback } from "../components/Feedback";
import { Carregando, ErroCarregar, Icone } from "../components/ui";
import { formataData } from "../formato";
import { useApi } from "../hooks";
import type { Documento, ListaDocumentos } from "../tipos";

const ORDEM = ["convencao", "regimento", "ata", "financeiro", "contrato", "outro"];

function tamanho(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export default function Documentos() {
  const { usuario } = useAuth();
  const { dados, erro, recarregar } = useApi<ListaDocumentos>("/documentos");
  const [filtro, setFiltro] = useState("todos");
  const [editando, setEditando] = useState<Documento | "novo" | null>(null);

  if (erro && !dados) return <ErroCarregar mensagem={erro} tentar={recarregar} />;
  if (!dados || !usuario) return <Carregando />;
  const admin = usuario.perfil === "admin";
  const { documentos, categorias } = dados;
  const usadas = ORDEM.filter((c) => documentos.some((d) => d.categoria === c));
  const grupos = (filtro === "todos" ? usadas : [filtro]).map((c) => ({ c, docs: documentos.filter((d) => d.categoria === c) }));

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="pagina-titulo">Documentos</h1>
          <p className="text-body-secondary mb-0">Convenção, regimento interno, atas e demais documentos oficiais do condomínio.</p>
        </div>
        {admin && <Button onClick={() => setEditando("novo")}><Icone nome="upload" /> Enviar documento</Button>}
      </div>

      {usadas.length > 1 && (
        <Nav variant="pills" activeKey={filtro} onSelect={(k) => setFiltro(k ?? "todos")} className="gap-1 mb-4 small">
          <Nav.Item><Nav.Link eventKey="todos" className="py-1 px-3">Todos</Nav.Link></Nav.Item>
          {usadas.map((c) => <Nav.Item key={c}><Nav.Link eventKey={c} className="py-1 px-3">{categorias[c]}</Nav.Link></Nav.Item>)}
        </Nav>
      )}

      {!documentos.length && (
        <div className="vazio mb-4">
          <Icone nome="documento" tamanho={28} />
          <p className="mt-2 mb-0">{admin ? "Nenhum documento ainda. Comece enviando a convenção e o regimento interno em PDF." : "Nenhum documento publicado ainda."}</p>
        </div>
      )}

      {grupos.map(({ c, docs }) => (
        <section key={c} className="mb-4">
          <h2 className="h6 text-body-secondary text-uppercase small fw-semibold mb-2" style={{ letterSpacing: ".05em" }}>{categorias[c]}</h2>
          <Card>
            {docs.map((d, i) => (
              <div key={d.id} className={`d-flex flex-wrap align-items-center gap-3 p-3 ${i ? "border-top" : ""}`}>
                <span className="numero-icone" style={{ background: "var(--bs-danger-bg-subtle)", color: "var(--bs-danger-text-emphasis)" }}>
                  <Icone nome="pdf" tamanho={20} />
                </span>
                <div className="flex-grow-1 min-w-0">
                  <a href={`/api/documentos/${d.id}/arquivo`} target="_blank" rel="noreferrer" className="fw-semibold link-body-emphasis">{d.titulo}</a>
                  {d.descricao && <div className="small text-body-secondary">{d.descricao}</div>}
                  <div className="small text-body-secondary">PDF · {tamanho(d.tamanho)} · enviado em {formataData(d.enviado_em)}</div>
                </div>
                <div className="d-flex gap-1">
                  <a className="btn btn-sm btn-outline-secondary" href={`/api/documentos/${d.id}/arquivo`} target="_blank" rel="noreferrer">Abrir</a>
                  <a className="btn btn-sm btn-outline-secondary" href={`/api/documentos/${d.id}/arquivo?baixar=1`} aria-label={`Baixar ${d.titulo}`}>
                    <Icone nome="download" tamanho={15} />
                  </a>
                  {admin && <AcoesAdmin d={d} aoEditar={() => setEditando(d)} aoMudar={recarregar} />}
                </div>
              </div>
            ))}
          </Card>
        </section>
      ))}

      {admin && !!dados.atas_sistema?.length && (
        <section className="mt-5">
          <h2 className="h5 mb-1">Atas geradas pelo sistema</h2>
          <p className="small text-body-secondary mb-3">
            Visíveis só para você, pois trazem o voto de cada unidade. Imprima, colha as assinaturas e publique a versão assinada acima, na categoria “Atas”.
          </p>
          <Card>
            {dados.atas_sistema.map((a, i) => (
              <div key={a.id} className={`d-flex flex-wrap align-items-center gap-3 p-3 ${i ? "border-top" : ""}`}>
                <span className="numero-icone"><Icone nome="documento" tamanho={20} /></span>
                <div className="flex-grow-1 min-w-0">
                  <div className="fw-semibold">Ata · {a.titulo}</div>
                  <div className="small text-body-secondary">Votação encerrada em {formataData(a.data_fim)}</div>
                </div>
                <a className="btn btn-sm btn-outline-secondary" href={`/api/admin/votacoes/${a.id}/ata.pdf`} target="_blank" rel="noreferrer">
                  <Icone nome="pdf" tamanho={15} /> Gerar PDF
                </a>
              </div>
            ))}
          </Card>
        </section>
      )}

      {editando && (
        <FormDocumento doc={editando === "novo" ? null : editando} categorias={categorias}
                       aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); recarregar(); }} />
      )}
    </>
  );
}

function AcoesAdmin({ d, aoEditar, aoMudar }: { d: Documento; aoEditar: () => void; aoMudar: () => void }) {
  const { avisar, confirmar } = useFeedback();
  const excluir = async () => {
    if (!(await confirmar({ titulo: `Excluir “${d.titulo}”?`, texto: "O arquivo deixa de estar disponível para os moradores.", confirmar: "Excluir", perigo: true }))) return;
    try {
      const r = await api.del(`/admin/documentos/${d.id}`);
      avisar(r.mensagem ?? "Excluído.");
      aoMudar();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  };
  return (
    <>
      <Button size="sm" variant="outline-secondary" onClick={aoEditar} aria-label="Editar"><Icone nome="lapis" tamanho={15} /></Button>
      <Button size="sm" variant="outline-danger" onClick={excluir} aria-label="Excluir"><Icone nome="lixo" tamanho={15} /></Button>
    </>
  );
}

function FormDocumento({ doc, categorias, aoFechar, aoSalvar }: {
  doc: Documento | null; categorias: Record<string, string>; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { avisar } = useFeedback();
  const [f, setF] = useState({ titulo: doc?.titulo ?? "", categoria: doc?.categoria ?? "convencao", descricao: doc?.descricao ?? "" });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!doc && !arquivo) return setErro("Escolha o arquivo PDF.");
    setEnviando(true);
    try {
      const r = doc ? await api.put(`/admin/documentos/${doc.id}`, f)
                    : await enviarArquivo<{ mensagem: string }>("/admin/documentos", arquivo!, f);
      avisar(r.mensagem ?? "Salvo.");
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setEnviando(false);
    }
  };

  const escolher = (file: File | undefined) => {
    if (!file) return;
    setArquivo(file);
    if (!f.titulo) setF({ ...f, titulo: file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ") });
  };

  return (
    <Modal show onHide={aoFechar} centered>
      <Form onSubmit={enviar}>
        <Modal.Header closeButton><Modal.Title className="h5">{doc ? "Editar documento" : "Enviar documento"}</Modal.Title></Modal.Header>
        <Modal.Body>
          {erro && <Alert variant="danger" className="py-2">{erro}</Alert>}
          {!doc && (
            <label className="zona-arquivo mb-3 py-4">
              <input type="file" accept="application/pdf,.pdf" className="d-none" onChange={(e) => escolher(e.target.files?.[0])} />
              <Icone nome="pdf" tamanho={26} />
              <div className="fw-semibold mt-2 text-break">{arquivo ? arquivo.name : "Clique para escolher o PDF"}</div>
              <div className="small text-body-secondary">{arquivo ? tamanho(arquivo.size) : "Somente PDF, até 20 MB"}</div>
            </label>
          )}
          <Row className="g-3">
            <Col xs={12}>
              <Form.Group controlId="doc-titulo">
                <Form.Label>Título</Form.Label>
                <Form.Control required maxLength={150} value={f.titulo} placeholder="Ex.: Convenção do condomínio"
                              onChange={(e) => setF({ ...f, titulo: e.target.value })} />
              </Form.Group>
            </Col>
            <Col xs={12}>
              <Form.Group controlId="doc-categoria">
                <Form.Label>Categoria</Form.Label>
                <Form.Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
                  {ORDEM.map((c) => <option key={c} value={c}>{categorias[c]}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col xs={12}>
              <Form.Group controlId="doc-descricao">
                <Form.Label>Descrição <span className="fw-normal text-body-secondary">(opcional)</span></Form.Label>
                <Form.Control as="textarea" rows={2} maxLength={500} value={f.descricao} placeholder="Ex.: Versão registrada em cartório em 2019"
                              onChange={(e) => setF({ ...f, descricao: e.target.value })} />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" disabled={enviando}>{enviando ? "Enviando…" : doc ? "Salvar" : "Publicar documento"}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
