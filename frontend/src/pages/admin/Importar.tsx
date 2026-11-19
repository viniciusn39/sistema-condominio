import { useState, type DragEvent } from "react";
import { Alert, Badge, Button, Card, Col, Row, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import { enviarArquivo, mensagemDeErro } from "../../api";
import { useFeedback } from "../../components/Feedback";
import { Icone } from "../../components/ui";
import type { ResultadoImportacao } from "../../tipos";

const COLUNAS = [
  ["bloco", "Bloco ou torre (obrigatório)"],
  ["apartamento", "Número da unidade (obrigatório)"],
  ["nome", "Nome do proprietário"],
  ["cpf", "CPF, com ou sem pontuação"],
  ["email", "E-mail usado para entrar no sistema"],
  ["vota", "“sim” se essa pessoa vota pela unidade"],
  ["senha", "Senha inicial (se vazio, o sistema gera uma)"],
];

export default function Importar() {
  const { avisar } = useFeedback();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<ResultadoImportacao | null>(null);
  const [final, setFinal] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);

  const simular = async (f: File) => {
    setArquivo(f);
    setPrevia(null);
    setFinal(null);
    setErro("");
    setEnviando(true);
    try {
      setPrevia(await enviarArquivo<ResultadoImportacao>("/admin/importar", f));
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const r = await enviarArquivo<ResultadoImportacao>("/admin/importar", arquivo, { confirmar: "1" });
      setFinal(r);
      setPrevia(null);
      avisar(r.mensagem ?? "Importação concluída.");
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    const f = e.dataTransfer.files[0];
    if (f) simular(f);
  };

  const baixarCredenciais = () => {
    if (!final?.credenciais) return;
    const linhas = [["nome", "email", "cpf", "senha inicial"], ...final.credenciais.map((c) => [c.nome, c.email, c.cpf, c.senha])];
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "acessos-moradores.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-4">
        <h1 className="pagina-titulo">Importar planilha</h1>
        <p className="text-body-secondary mb-0">Cadastre todas as unidades e proprietários de uma vez, a partir de um arquivo Excel ou CSV.</p>
      </div>

      <Row className="g-4">
        <Col lg={4}>
          <Card className="h-100">
            <Card.Body>
              <div className="d-flex align-items-center gap-2 mb-3"><span className="passo-num">1</span><h2 className="h6 mb-0">Prepare a planilha</h2></div>
              <p className="small text-body-secondary">Uma linha por unidade. A primeira linha deve ter os títulos das colunas:</p>
              <ul className="list-unstyled small mb-3">
                {COLUNAS.map(([c, d]) => (
                  <li key={c} className="d-flex gap-2 py-1 border-bottom">
                    <code className="text-primary-emphasis" style={{ minWidth: 86 }}>{c}</code><span className="text-body-secondary">{d}</span>
                  </li>
                ))}
              </ul>
              <p className="small text-body-secondary">Proprietário de mais de uma unidade? Repita a pessoa em cada linha. Linhas só com bloco e apartamento criam a unidade vazia.</p>
              <a className="btn btn-outline-primary btn-sm" href="/api/admin/importar/modelo.csv"><Icone nome="download" tamanho={15} /> Baixar modelo</a>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={8}>
          <Card>
            <Card.Body>
              <div className="d-flex align-items-center gap-2 mb-3"><span className="passo-num">2</span><h2 className="h6 mb-0">Envie o arquivo e confira</h2></div>
              <label className={`zona-arquivo ${arrastando ? "ativa" : ""}`}
                     onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={soltar}>
                <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                       className="d-none" onChange={(e) => { const f = e.target.files?.[0]; if (f) simular(f); e.target.value = ""; }} />
                <Icone nome="upload" tamanho={28} />
                <div className="fw-semibold mt-2">{arquivo ? arquivo.name : "Arraste a planilha aqui ou clique para escolher"}</div>
                <div className="small text-body-secondary">Arquivos .xlsx ou .csv, até 20 MB. Nada é gravado antes da sua confirmação.</div>
              </label>

              {enviando && <div className="d-flex align-items-center gap-2 mt-3 text-body-secondary"><Spinner size="sm" /> Processando planilha…</div>}
              {erro && <Alert variant="danger" className="mt-3 mb-0">{erro}</Alert>}

              {previa?.linhas && (
                <div className="mt-4">
                  <Row xs={2} md={4} className="g-2 mb-3">
                    {[["Linhas", previa.resumo.linhas], ["Unidades novas", previa.resumo.unidades_novas],
                      ["Moradores novos", previa.resumo.moradores_novos], ["Com erro", previa.resumo.erros]].map(([r, v]) => (
                      <Col key={r as string}>
                        <div className={`border rounded-3 p-2 px-3 ${r === "Com erro" && Number(v) > 0 ? "bg-danger-subtle border-danger-subtle" : ""}`}>
                          <div className="small text-body-secondary">{r}</div><strong className="fs-5">{v}</strong>
                        </div>
                      </Col>
                    ))}
                  </Row>
                  <div className="border rounded-3 overflow-auto" style={{ maxHeight: 380 }}>
                    <Table size="sm" className="mb-0 small align-middle">
                      <thead className="sticky-top"><tr><th>Linha</th><th>Unidade</th><th>Pessoa</th><th>O que vai acontecer</th></tr></thead>
                      <tbody>
                        {previa.linhas.map((l) => (
                          <tr key={l.linha} className={l.erro ? "table-danger" : ""}>
                            <td className="tabular text-body-secondary">{l.linha}</td>
                            <td><span className="unidade-tag">{l.unidade}</span></td>
                            <td>{l.nome || <span className="text-body-secondary">—</span>}<div className="text-body-secondary">{l.email}</div></td>
                            <td>{l.erro ? <span className="text-danger-emphasis fw-medium">{l.erro}</span>
                              : l.acoes.length ? l.acoes.map((a) => <Badge key={a} bg="" className="bg-body-tertiary text-body border fw-normal me-1">{a}</Badge>)
                              : <span className="text-body-secondary">nada a fazer (já cadastrado)</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                  <div className="d-flex flex-wrap justify-content-end align-items-center gap-3 mt-3">
                    {previa.resumo.erros > 0 && <span className="small text-danger-emphasis">Corrija as linhas em vermelho na planilha e envie de novo.</span>}
                    <Button disabled={previa.resumo.erros > 0 || enviando} onClick={confirmar}>
                      <Icone nome="check" tamanho={16} /> Confirmar importação
                    </Button>
                  </div>
                </div>
              )}

              {final && (
                <div className="mt-4">
                  <Alert variant="success" className="d-flex align-items-center gap-2"><Icone nome="check" /> {final.mensagem}</Alert>
                  {!!final.credenciais?.length && (
                    <>
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                        <div>
                          <h3 className="h6 mb-0">Acessos criados</h3>
                          <p className="small text-body-secondary mb-0">Entregue a cada morador o e-mail e a senha inicial. Esta lista só aparece agora.</p>
                        </div>
                        <Button size="sm" variant="outline-primary" onClick={baixarCredenciais}><Icone nome="download" tamanho={15} /> Baixar lista</Button>
                      </div>
                      <div className="border rounded-3 overflow-auto" style={{ maxHeight: 320 }}>
                        <Table size="sm" className="mb-0 small">
                          <thead><tr><th>Nome</th><th>E-mail</th><th>Senha inicial</th></tr></thead>
                          <tbody>{final.credenciais.map((c) => (
                            <tr key={c.email}><td>{c.nome}</td><td>{c.email}</td><td><code>{c.senha}</code></td></tr>
                          ))}</tbody>
                        </Table>
                      </div>
                    </>
                  )}
                  <div className="d-flex gap-2 mt-3">
                    <Link to="/admin/unidades" className="btn btn-outline-secondary btn-sm">Ver unidades</Link>
                    <Link to="/admin/moradores" className="btn btn-outline-secondary btn-sm">Ver moradores</Link>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
