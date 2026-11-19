import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Col, Form, InputGroup, Row } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, mensagemDeErro } from "../../api";
import { useFeedback } from "../../components/Feedback";
import { Carregando, ErroCarregar, Icone } from "../../components/ui";
import { agoraBrasilia } from "../../formato";
import { useApi } from "../../hooks";
import type { DetalheVotacao, Maioria } from "../../tipos";

const MAIORIAS: { valor: Maioria; rotulo: string; dica: string }[] = [
  { valor: "simples", rotulo: "Maioria simples", dica: "Vence a opção mais votada entre os votos registrados." },
  { valor: "absoluta", rotulo: "Maioria absoluta", dica: "A vencedora precisa de mais da metade de todas as unidades do condomínio." },
  { valor: "dois_tercos", rotulo: "Dois terços", dica: "A vencedora precisa de 2/3 de todas as unidades. Exigido, por exemplo, para alterar a convenção." },
];

interface Campos {
  titulo: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  opcoes: string[];
  quorum_minimo: number;
  maioria: Maioria;
  fundamento: string;
}

const PADRAO = (): Campos => ({
  titulo: "",
  descricao: "",
  data_inicio: agoraBrasilia(),
  data_fim: agoraBrasilia(7).slice(0, 11) + "23:59",
  opcoes: ["Aprovo", "Reprovo", "Abstenção"],
  quorum_minimo: 0,
  maioria: "simples",
  fundamento: "",
});

export default function VotacaoForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const { dados, erro: erroCarregar } = useApi<DetalheVotacao>(editando ? `/votacoes/${id}` : null);
  const [f, setF] = useState<Campos | null>(editando ? null : PADRAO());
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { avisar } = useFeedback();
  const navegar = useNavigate();

  useEffect(() => {
    if (dados) {
      const v = dados.votacao;
      setF({ titulo: v.titulo, descricao: v.descricao ?? "", data_inicio: v.data_inicio, data_fim: v.data_fim,
             opcoes: dados.opcoes.map((o) => o.texto), quorum_minimo: v.quorum_minimo ?? 0, maioria: v.maioria ?? "simples",
             fundamento: v.fundamento ?? "" });
    }
  }, [dados]);

  if (erroCarregar) return <ErroCarregar mensagem={erroCarregar} />;
  if (!f) return <Carregando />;
  if (editando && dados && !dados.pode_editar) {
    return <ErroCarregar mensagem="Só é possível editar votações que ainda não receberam votos." />;
  }

  const atualiza = (parcial: Partial<Campos>) => setF({ ...f, ...parcial });
  const mudaOpcao = (i: number, texto: string) => atualiza({ opcoes: f.opcoes.map((o, j) => (j === i ? texto : o)) });
  const voltarPara = editando ? `/votacoes/${id}` : "/admin";

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const corpo = { ...f, opcoes: f.opcoes.filter((o) => o.trim()) };
      if (editando) {
        const r = await api.put(`/admin/votacoes/${id}`, corpo);
        avisar(r.mensagem ?? "Votação atualizada.");
        navegar(`/votacoes/${id}`);
      } else {
        const r = await api.post<{ id: number; mensagem: string }>("/admin/votacoes", corpo);
        avisar(r.mensagem);
        navegar(`/votacoes/${r.id}`);
      }
    } catch (err) {
      setErro(mensagemDeErro(err));
      setEnviando(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="mx-auto" style={{ maxWidth: 760 }}>
      <Link className="link-secondary small d-inline-flex align-items-center gap-1 mb-3" to={voltarPara}>
        <Icone nome="voltar" tamanho={16} /> Voltar
      </Link>
      <h1 className="pagina-titulo mb-4">{editando ? "Editar votação" : "Nova votação"}</h1>

      <Card className="shadow-sm">
        <Card.Body className="p-4">
          {erro && <Alert variant="danger" className="py-2">{erro}</Alert>}
          <Form onSubmit={enviar}>
            <Form.Group className="mb-3" controlId="titulo">
              <Form.Label>Pauta</Form.Label>
              <Form.Control required maxLength={150} value={f.titulo} placeholder="Ex.: Reforma do salão de festas"
                            onChange={(e) => atualiza({ titulo: e.target.value })} />
            </Form.Group>

            <Form.Group className="mb-3" controlId="descricao">
              <Form.Label>Descrição <span className="fw-normal text-body-secondary">(opcional)</span></Form.Label>
              <Form.Control as="textarea" rows={4} value={f.descricao} placeholder="Detalhes, valores, orçamentos, links…"
                            onChange={(e) => atualiza({ descricao: e.target.value })} />
            </Form.Group>

            <Row className="g-3 mb-2">
              <Col sm={6}>
                <Form.Group controlId="data_inicio">
                  <Form.Label>Abre em</Form.Label>
                  <Form.Control type="datetime-local" required value={f.data_inicio}
                                onChange={(e) => atualiza({ data_inicio: e.target.value })} />
                </Form.Group>
              </Col>
              <Col sm={6}>
                <Form.Group controlId="data_fim">
                  <Form.Label>Encerra em</Form.Label>
                  <Form.Control type="datetime-local" required value={f.data_fim}
                                onChange={(e) => atualiza({ data_fim: e.target.value })} />
                </Form.Group>
              </Col>
            </Row>
            <Alert variant="info" className="d-flex gap-2 small py-2 mb-4">
              <Icone nome="relogio" tamanho={16} />
              <span>Horário de Brasília. A votação abre e encerra automaticamente nesses horários, e o resultado fica visível para todos no encerramento.</span>
            </Alert>

            <h2 className="h6 mb-1">Regras de apuração</h2>
            <p className="small text-body-secondary mb-3">Siga o que a convenção do condomínio exige para este tipo de assunto.</p>
            <Row className="g-3 mb-4">
              <Col sm={5}>
                <Form.Group controlId="quorum">
                  <Form.Label>Quórum mínimo</Form.Label>
                  <InputGroup>
                    <Form.Control type="number" min={0} max={100} step={1} value={f.quorum_minimo}
                                  onChange={(e) => atualiza({ quorum_minimo: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                    <InputGroup.Text>% das unidades</InputGroup.Text>
                  </InputGroup>
                  <Form.Text>{f.quorum_minimo ? `A decisão só vale se pelo menos ${f.quorum_minimo}% das unidades votarem.` : "Sem quórum mínimo: vale com qualquer participação."}</Form.Text>
                </Form.Group>
              </Col>
              <Col sm={7}>
                <Form.Group controlId="maioria">
                  <Form.Label>Maioria exigida</Form.Label>
                  <Form.Select value={f.maioria} onChange={(e) => atualiza({ maioria: e.target.value as Maioria })}>
                    {MAIORIAS.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                  </Form.Select>
                  <Form.Text>{MAIORIAS.find((m) => m.valor === f.maioria)?.dica}</Form.Text>
                </Form.Group>
              </Col>
              <Col xs={12}>
                <Form.Group controlId="fundamento">
                  <Form.Label>Fundamento na convenção <span className="fw-normal text-body-secondary">(opcional)</span></Form.Label>
                  <Form.Control maxLength={200} value={f.fundamento} placeholder="Ex.: Art. 22 da Convenção"
                                onChange={(e) => atualiza({ fundamento: e.target.value })} />
                  <Form.Text>Aparece para os moradores e na ata. <Link to="/documentos" target="_blank">Consultar a convenção</Link></Form.Text>
                </Form.Group>
              </Col>
            </Row>

            <Form.Label>Opções de voto</Form.Label>
            <div className="d-grid gap-2 mb-2">
              {f.opcoes.map((o, i) => (
                <InputGroup key={i}>
                  <InputGroup.Text className="tabular" style={{ minWidth: 44 }}>{i + 1}</InputGroup.Text>
                  <Form.Control value={o} maxLength={100} aria-label={`Opção ${i + 1}`} placeholder="Texto da opção"
                                onChange={(e) => mudaOpcao(i, e.target.value)} />
                  <Button variant="outline-secondary" aria-label={`Remover opção ${i + 1}`} disabled={f.opcoes.length <= 2}
                          onClick={() => atualiza({ opcoes: f.opcoes.filter((_, j) => j !== i) })}>
                    <Icone nome="lixo" tamanho={16} />
                  </Button>
                </InputGroup>
              ))}
            </div>
            {f.opcoes.length < 20 && (
              <Button variant="link" className="px-0" onClick={() => atualiza({ opcoes: [...f.opcoes, ""] })}>
                <Icone nome="mais" tamanho={16} /> Adicionar opção
              </Button>
            )}

            <div className="d-flex justify-content-end gap-2 border-top pt-4 mt-3">
              <Link className="btn btn-outline-secondary" to={voltarPara}>Cancelar</Link>
              <Button type="submit" disabled={enviando}>
                {enviando ? "Salvando…" : editando ? "Salvar alterações" : "Criar votação"}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}
