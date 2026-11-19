import { useState, type FormEvent } from "react";
import { Alert, Button, Form, InputGroup, Spinner } from "react-bootstrap";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { mensagemDeErro } from "../api";
import { destinoInicial, useAuth } from "../auth";
import { Icone, Marca } from "../components/ui";

const GARANTIAS = [
  { icone: "urna", texto: "Um voto por unidade, do proprietário ou de quem ele indicar" },
  { icone: "relogio", texto: "Votações abrem e encerram sozinhas no horário marcado" },
  { icone: "documento", texto: "Cada voto registrado com data e hora, pronto para a ata" },
];

export default function Entrar() {
  const { usuario, condominio, condominioAtual, entrar } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const de = (local.state as { de?: string } | null)?.de;
  if (usuario) return <Navigate to={condominioAtual ? de ?? destinoInicial({ usuario, condominio_atual: condominioAtual }) : "/bem-vindo"} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const s = await entrar(email, senha);
      navegar(s.condominio_atual ? de ?? destinoInicial(s) : "/bem-vindo", { replace: true });
    } catch (err) {
      setErro(mensagemDeErro(err));
      setEnviando(false);
    }
  };

  return (
    <div className="entrar">
      <div className="entrar-form">
        <div className="d-flex justify-content-between align-items-center">
          <Link to="/" className="marca"><Marca condominio={condominio} /></Link>
          <Link to="/" className="small text-body-secondary">← Voltar ao site</Link>
        </div>

        <div className="flex-grow-1 d-flex align-items-center justify-content-center py-5">
          <div className="w-100" style={{ maxWidth: 380 }}>
            <h1 className="pagina-titulo mb-2">Entrar na sua conta</h1>
            <p className="text-body-secondary mb-4">
              {condominio ? `Assembleia online do ${condominio}. ` : ""}Use o seu e-mail e a sua senha.
            </p>

            {erro && <Alert variant="danger" className="py-2 small">{erro}</Alert>}

            <Form onSubmit={enviar}>
              <Form.Group className="mb-3" controlId="email">
                <Form.Label>E-mail</Form.Label>
                <Form.Control type="email" autoComplete="username" required autoFocus placeholder="voce@email.com"
                              value={email} onChange={(e) => setEmail(e.target.value)} />
              </Form.Group>
              <Form.Group className="mb-4" controlId="senha">
                <Form.Label>Senha</Form.Label>
                <InputGroup>
                  <Form.Control type={verSenha ? "text" : "password"} autoComplete="current-password" required
                                value={senha} onChange={(e) => setSenha(e.target.value)} />
                  <Button variant="outline-secondary" onClick={() => setVerSenha((v) => !v)}
                          aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}>
                    {verSenha ? "Ocultar" : "Mostrar"}
                  </Button>
                </InputGroup>
              </Form.Group>
              <Button type="submit" className="w-100 py-2" disabled={enviando}>
                {enviando ? <><Spinner size="sm" animation="border" /> Entrando…</> : "Entrar"}
              </Button>
            </Form>

            <p className="small text-body-secondary mt-4 mb-0">
              Esqueceu a senha ou ainda não tem acesso? Fale com a administração do condomínio.
            </p>
            <div className="entrar-cadastro mt-4">
              <Icone nome="predio" tamanho={20} />
              <div className="small">
                <strong className="d-block">É síndico?</strong>
                <Link to="/cadastro">Cadastre o seu condomínio</Link> e comece a usar.
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="entrar-vitrine">
        <div style={{ maxWidth: 460 }}>
          <h2 className="h1 mb-3">Decisões do condomínio, sem precisar descer ao salão.</h2>
          <p className="mb-5 opacity-75">Vote pelo celular ou computador, dentro do prazo, e acompanhe o resultado assim que a votação encerra.</p>
          <ul className="list-unstyled d-grid gap-3 mb-0">
            {GARANTIAS.map((g) => (
              <li key={g.texto} className="d-flex align-items-center gap-3">
                <span className="d-inline-grid rounded-3 flex-none" style={{ placeItems: "center", width: 38, height: 38, background: "rgba(255,255,255,.1)", flex: "none" }}>
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
