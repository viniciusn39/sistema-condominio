import { useState, type FormEvent } from "react";
import { Alert, Button, Col, Form, InputGroup, Row, Spinner } from "react-bootstrap";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, mensagemDeErro } from "../api";
import { destinoInicial, useAuth } from "../auth";
import { CamposCondominio, CamposMandato, condominioVazio, mandatoVazio } from "../components/FormCondominio";
import { useFeedback } from "../components/Feedback";
import { Icone, Marca } from "../components/ui";
import { cpfValido, mascaraCpf, mascaraTelefone, soDigitos } from "../formato";
import type { DadosCondominio, DadosMandato, Sessao } from "../tipos";

const PASSOS = ["Seus dados", "Mandato", "Condomínio"];

const PRECISA = [
  { icone: "usuarios", texto: "Seu CPF, e-mail e celular" },
  { icone: "calendario", texto: "As datas do mandato, que estão na ata da eleição" },
  { icone: "predio", texto: "CNPJ e endereço do condomínio (o CNPJ é opcional)" },
];

export default function Cadastro() {
  const { usuario, condominioAtual, aplicar } = useAuth();
  const { avisar } = useFeedback();
  const navegar = useNavigate();
  const [passo, setPasso] = useState(0);
  const [p, setP] = useState({ nome: "", cpf: "", email: "", telefone: "", senha: "", confirmacao: "" });
  const [m, setM] = useState<DadosMandato>(mandatoVazio);
  const [c, setC] = useState<DadosCondominio>(condominioVazio);
  const [aceite, setAceite] = useState(false);
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  // já conectado (inclusive logo após concluir o cadastro): vai para o sistema
  if (usuario) return <Navigate to={destinoInicial({ usuario, condominio_atual: condominioAtual })} replace />;

  const mudaM = <K extends keyof DadosMandato>(k: K, v: DadosMandato[K]) => setM((a) => ({ ...a, [k]: v }));
  const mudaC = <K extends keyof DadosCondominio>(k: K, v: DadosCondominio[K]) => setC((a) => ({ ...a, [k]: v }));

  const avancar = (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (passo === 0) {
      if (!cpfValido(p.cpf)) return setErro("CPF inválido. Confira os números.");
      if (soDigitos(p.telefone).length < 10) return setErro("Informe o celular com DDD.");
      if (p.senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
      if (p.senha !== p.confirmacao) return setErro("A confirmação não confere com a senha.");
    }
    if (passo === 1 && m.mandato_fim <= m.mandato_inicio) return setErro("O fim do mandato deve ser depois do início.");
    if (passo < PASSOS.length - 1) {
      setPasso(passo + 1);
      window.scrollTo(0, 0);
      return;
    }
    concluir();
  };

  const concluir = async () => {
    if (!aceite) return setErro("Para continuar, marque a autorização de uso dos dados.");
    setEnviando(true);
    try {
      const s = await api.post<Sessao & { mensagem: string }>("/cadastro", { sindico: { ...p, ...m }, condominio: c, aceite });
      avisar(s.mensagem);
      navegar(destinoInicial(s), { replace: true });
      aplicar(s);
    } catch (err) {
      setErro(mensagemDeErro(err));
      setEnviando(false);
    }
  };

  return (
    <div className="entrar">
      <div className="entrar-form">
        <div className="d-flex justify-content-between align-items-center">
          <Link to="/" className="marca"><Marca /></Link>
          <Link to="/entrar" className="small text-body-secondary">Já tenho conta</Link>
        </div>

        <div className="flex-grow-1 py-5">
          <div className="mx-auto" style={{ maxWidth: 560 }}>
            <h1 className="pagina-titulo mb-2">Cadastre seu condomínio</h1>
            <p className="text-body-secondary mb-4">Para síndicos. Em poucos minutos você cria o espaço do condomínio e já pode cadastrar as unidades.</p>

            <ol className="passos mb-4" aria-label="Etapas do cadastro">
              {PASSOS.map((t, i) => (
                <li key={t} className={i === passo ? "atual" : i < passo ? "feito" : ""} aria-current={i === passo ? "step" : undefined}>
                  <span className="passo-num">{i < passo ? <Icone nome="check" tamanho={13} /> : i + 1}</span> {t}
                </li>
              ))}
            </ol>

            {erro && <Alert variant="danger" className="py-2 small">{erro}</Alert>}

            <Form onSubmit={avancar}>
              {passo === 0 && (
                <Row className="g-3">
                  <Col xs={12}>
                    <Form.Group controlId="s-nome">
                      <Form.Label>Nome completo</Form.Label>
                      <Form.Control required maxLength={120} autoComplete="name" value={p.nome} autoFocus
                                    onChange={(e) => setP({ ...p, nome: e.target.value })} />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="s-cpf">
                      <Form.Label>CPF</Form.Label>
                      <Form.Control required inputMode="numeric" placeholder="000.000.000-00" value={p.cpf}
                                    isInvalid={soDigitos(p.cpf).length === 11 && !cpfValido(p.cpf)}
                                    onChange={(e) => setP({ ...p, cpf: mascaraCpf(e.target.value) })} />
                      <Form.Control.Feedback type="invalid">CPF inválido.</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="s-telefone">
                      <Form.Label>Celular (WhatsApp)</Form.Label>
                      <Form.Control required inputMode="tel" autoComplete="tel" placeholder="(11) 98888-7777" value={p.telefone}
                                    onChange={(e) => setP({ ...p, telefone: mascaraTelefone(e.target.value) })} />
                    </Form.Group>
                  </Col>
                  <Col xs={12}>
                    <Form.Group controlId="s-email">
                      <Form.Label>E-mail</Form.Label>
                      <Form.Control required type="email" autoComplete="email" maxLength={254} value={p.email}
                                    onChange={(e) => setP({ ...p, email: e.target.value })} />
                      <Form.Text>É com ele que você vai entrar no sistema.</Form.Text>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="s-senha">
                      <Form.Label>Senha</Form.Label>
                      <InputGroup>
                        <Form.Control required type={verSenha ? "text" : "password"} autoComplete="new-password" minLength={8}
                                      value={p.senha} onChange={(e) => setP({ ...p, senha: e.target.value })} />
                        <Button variant="outline-secondary" onClick={() => setVerSenha((v) => !v)}
                                aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}>{verSenha ? "Ocultar" : "Mostrar"}</Button>
                      </InputGroup>
                      <Form.Text>Pelo menos 8 caracteres.</Form.Text>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="s-confirmacao">
                      <Form.Label>Confirme a senha</Form.Label>
                      <Form.Control required type={verSenha ? "text" : "password"} autoComplete="new-password"
                                    value={p.confirmacao} isInvalid={!!p.confirmacao && p.confirmacao !== p.senha}
                                    onChange={(e) => setP({ ...p, confirmacao: e.target.value })} />
                      <Form.Control.Feedback type="invalid">As senhas não conferem.</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>
              )}

              {passo === 1 && <CamposMandato m={m} muda={mudaM} />}

              {passo === 2 && (
                <>
                  <CamposCondominio c={c} muda={mudaC} />
                  <Form.Check className="mt-4 small" id="aceite" checked={aceite} onChange={(e) => setAceite(e.target.checked)}
                              label="Declaro que sou o síndico (ou represento a empresa de sindicatura) deste condomínio e autorizo o uso destes dados para a gestão das assembleias, conforme a LGPD (Lei 13.709/2018)." />
                </>
              )}

              <div className="d-flex justify-content-between align-items-center gap-2 mt-4 pt-3 border-top">
                {passo > 0
                  ? <Button variant="outline-secondary" onClick={() => { setErro(""); setPasso(passo - 1); }}><Icone nome="voltar" tamanho={16} /> Voltar</Button>
                  : <span className="small text-body-secondary">Passo 1 de {PASSOS.length}</span>}
                <Button type="submit" disabled={enviando}>
                  {enviando ? <><Spinner size="sm" /> Criando…</>
                    : passo < PASSOS.length - 1 ? <>Continuar <Icone nome="seta" tamanho={16} /></>
                    : <><Icone nome="check" tamanho={16} /> Criar condomínio</>}
                </Button>
              </div>
            </Form>
          </div>
        </div>
      </div>

      <aside className="entrar-vitrine">
        <div style={{ maxWidth: 420 }}>
          <h2 className="h1 mb-3">Assembleias do seu condomínio, online.</h2>
          <p className="mb-5 opacity-75">Depois do cadastro você importa as unidades por planilha, convida os moradores e abre a primeira votação.</p>
          <div className="small text-uppercase fw-semibold opacity-75 mb-3" style={{ letterSpacing: ".06em" }}>Tenha em mãos</div>
          <ul className="list-unstyled d-grid gap-3 mb-0">
            {PRECISA.map((g) => (
              <li key={g.texto} className="d-flex align-items-center gap-3">
                <span className="d-inline-grid rounded-3" style={{ placeItems: "center", width: 38, height: 38, background: "rgba(255,255,255,.1)", flex: "none" }}>
                  <Icone nome={g.icone} tamanho={18} />
                </span>
                <span>{g.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
