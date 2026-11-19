import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Card, Col, Collapse, Form, InputGroup, Row } from "react-bootstrap";
import { api, mensagemDeErro } from "../../api";
import { useAuth } from "../../auth";
import { useFeedback } from "../../components/Feedback";
import { Carregando, ErroCarregar, Icone } from "../../components/ui";
import { iniciais } from "../../formato";
import { useApi } from "../../hooks";
import type { Morador, Perfil } from "../../tipos";

interface CamposMorador {
  nome: string;
  cpf: string;
  email: string;
  perfil: Perfil;
  senha?: string;
}

export default function Moradores() {
  const { dados, erro, recarregar } = useApi<{ moradores: Morador[] }>("/admin/moradores");
  const [novo, setNovo] = useState(false);
  const [busca, setBusca] = useState("");

  if (erro && !dados) return <ErroCarregar mensagem={erro} tentar={recarregar} />;
  if (!dados) return <Carregando />;

  const termo = busca.trim().toLowerCase();
  const lista = dados.moradores.filter((m) =>
    !termo || [m.nome, m.email, m.cpf, m.proprias, m.vota_por].some((c) => c?.toLowerCase().includes(termo)));

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="pagina-titulo">Moradores</h1>
          <p className="text-body-secondary mb-0">Quem tem acesso ao sistema. Para votar, a pessoa também precisa ser votante de uma unidade.</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link to="/admin/importar" className="btn btn-outline-secondary"><Icone nome="upload" tamanho={16} /> Importar planilha</Link>
          <Button onClick={() => setNovo((v) => !v)} aria-expanded={novo}>
            <Icone nome="mais" /> Cadastrar morador
          </Button>
        </div>
      </div>

      <Collapse in={novo}>
        <div>
          <Card className="shadow-sm mb-4">
            <Card.Body className="p-4">
              <h2 className="h5 mb-3">Novo morador</h2>
              <FormMorador inicial={{ nome: "", cpf: "", email: "", perfil: "votante", senha: "" }} novo
                           aoSalvar={() => { setNovo(false); recarregar(); }} aoCancelar={() => setNovo(false)} />
            </Card.Body>
          </Card>
        </div>
      </Collapse>

      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <InputGroup style={{ maxWidth: 440 }}>
          <InputGroup.Text><Icone nome="busca" tamanho={16} /></InputGroup.Text>
          <Form.Control type="search" placeholder="Buscar por nome, e-mail, CPF ou unidade…" value={busca}
                        onChange={(e) => setBusca(e.target.value)} aria-label="Buscar moradores" />
        </InputGroup>
        <span className="small text-body-secondary">{lista.length} de {dados.moradores.length}</span>
      </div>

      <div className="d-grid gap-2">
        {lista.map((m) => <ItemMorador key={m.id} m={m} aoMudar={recarregar} />)}
        {!lista.length && <p className="vazio">Nenhum morador encontrado.</p>}
      </div>
    </>
  );
}

function ItemMorador({ m, aoMudar }: { m: Morador; aoMudar: () => void }) {
  const { usuario } = useAuth();
  const { avisar, confirmar } = useFeedback();
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");

  const redefinir = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post(`/admin/moradores/${m.id}/senha`, { senha });
      avisar(r.mensagem ?? "Senha redefinida.");
      setSenha("");
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    }
  };

  const alternar = async () => {
    if (m.ativo && !(await confirmar({
      titulo: `Desativar o acesso de ${m.nome}?`,
      texto: "A pessoa não conseguirá mais entrar, e as unidades por quem vota ficarão sem votante.",
      confirmar: "Desativar", perigo: true,
    }))) return;
    try {
      const r = await api.post(`/admin/moradores/${m.id}/ativo`);
      avisar(r.mensagem ?? "Feito.");
      aoMudar();
    } catch (err) {
      avisar(mensagemDeErro(err), "erro");
    }
  };

  return (
    <Card className={`shadow-sm ${m.ativo ? "" : "item-inativo"}`}>
      <Card.Body className="d-flex flex-wrap align-items-center gap-3 py-3">
        <span className="avatar avatar-lg">{iniciais(m.nome)}</span>
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <strong>{m.nome}</strong>
            {m.perfil === "admin" && <Badge bg="" className="bg-warning-subtle text-warning-emphasis">Síndico</Badge>}
            {!m.ativo && <Badge bg="secondary">Desativado</Badge>}
          </div>
          <div className="small text-body-secondary text-break">{m.email} · CPF {m.cpf}</div>
          <div className="small">
            {m.proprias && <>Proprietário(a) de <strong>{m.proprias}</strong></>}
            {m.proprias && m.vota_por && " · "}
            {m.vota_por && <>Vota por <strong>{m.vota_por}</strong></>}
            {!m.proprias && !m.vota_por && <span className="text-body-secondary">Sem unidade vinculada</span>}
          </div>
        </div>
        <Button variant="outline-secondary" size="sm" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
          {aberto ? "Fechar" : "Gerenciar"}
        </Button>
      </Card.Body>
      <Collapse in={aberto}>
        <div>
          <div className="gerenciar p-3 p-md-4 rounded-bottom">
            <FormMorador inicial={{ nome: m.nome, cpf: m.cpf, email: m.email, perfil: m.perfil }} id={m.id}
                         aoSalvar={() => { setAberto(false); aoMudar(); }} />
            <hr />
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
              <Form onSubmit={redefinir} className="flex-grow-1" style={{ maxWidth: 460 }}>
                <InputGroup>
                  <Form.Control type="text" minLength={8} required placeholder="Nova senha (mín. 8)" autoComplete="off"
                                value={senha} onChange={(e) => setSenha(e.target.value)} aria-label="Nova senha" />
                  <Button type="submit" variant="outline-secondary"><Icone nome="chave" tamanho={16} /> Redefinir senha</Button>
                </InputGroup>
              </Form>
              {m.id !== usuario?.id && (
                <Button variant={m.ativo ? "outline-danger" : "outline-success"} onClick={alternar}>
                  {m.ativo ? "Desativar acesso" : "Reativar acesso"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Collapse>
    </Card>
  );
}

function FormMorador({ inicial, id, novo, aoSalvar, aoCancelar }: {
  inicial: CamposMorador; id?: number; novo?: boolean; aoSalvar: () => void; aoCancelar?: () => void;
}) {
  const { avisar } = useFeedback();
  const [f, setF] = useState(inicial);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = (k: keyof CamposMorador) => ({
    value: f[k] ?? "",
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
  });
  const pref = `m${id ?? "novo"}`;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = novo ? await api.post("/admin/moradores", f) : await api.put(`/admin/moradores/${id}`, f);
      avisar(r.mensagem ?? "Salvo.");
      if (novo) setF(inicial);
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Form onSubmit={enviar}>
      {erro && <Alert variant="danger" className="py-2">{erro}</Alert>}
      <Row className="g-3">
        <Col md={6} lg={4}><Form.Group controlId={`${pref}-nome`}><Form.Label>Nome completo</Form.Label><Form.Control required {...campo("nome")} /></Form.Group></Col>
        <Col md={6} lg={4}><Form.Group controlId={`${pref}-cpf`}><Form.Label>CPF</Form.Label><Form.Control required inputMode="numeric" placeholder="000.000.000-00" {...campo("cpf")} /></Form.Group></Col>
        <Col md={6} lg={4}><Form.Group controlId={`${pref}-email`}><Form.Label>E-mail</Form.Label><Form.Control type="email" required {...campo("email")} /></Form.Group></Col>
        {novo && <Col md={6} lg={4}><Form.Group controlId={`${pref}-senha`}><Form.Label>Senha inicial</Form.Label><Form.Control type="text" minLength={8} required autoComplete="off" {...campo("senha")} /><Form.Text>Mínimo de 8 caracteres.</Form.Text></Form.Group></Col>}
        <Col md={6} lg={4}>
          <Form.Group controlId={`${pref}-perfil`}>
            <Form.Label>Perfil</Form.Label>
            <Form.Select {...campo("perfil")}>
              <option value="votante">Morador</option>
              <option value="admin">Síndico / administrador</option>
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>
      <div className="d-flex justify-content-end gap-2 mt-3">
        {aoCancelar && <Button variant="outline-secondary" onClick={aoCancelar}>Cancelar</Button>}
        <Button type="submit" disabled={enviando}>{novo ? "Cadastrar" : "Salvar dados"}</Button>
      </div>
    </Form>
  );
}
