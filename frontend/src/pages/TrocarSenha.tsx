import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { api, mensagemDeErro } from "../api";
import { useFeedback } from "../components/Feedback";

export default function TrocarSenha() {
  const { avisar } = useFeedback();
  const navegar = useNavigate();
  const [f, setF] = useState({ atual: "", nova: "", confirmacao: "" });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (f.nova !== f.confirmacao) return setErro("A confirmação não confere com a nova senha.");
    setEnviando(true);
    try {
      const r = await api.post("/conta/senha", f);
      avisar(r.mensagem ?? "Senha alterada.");
      navegar("/votacoes");
    } catch (err) {
      setErro(mensagemDeErro(err));
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto" style={{ maxWidth: 520 }}>
      <h1 className="pagina-titulo mb-4">Trocar senha</h1>
      <Card className="shadow-sm">
        <Card.Body className="p-4">
          {erro && <Alert variant="danger" className="py-2">{erro}</Alert>}
          <Form onSubmit={enviar}>
            <Form.Group className="mb-3" controlId="atual">
              <Form.Label>Senha atual</Form.Label>
              <Form.Control type="password" autoComplete="current-password" required {...campo("atual")} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="nova">
              <Form.Label>Nova senha</Form.Label>
              <Form.Control type="password" autoComplete="new-password" minLength={8} required {...campo("nova")} />
              <Form.Text>Pelo menos 8 caracteres.</Form.Text>
            </Form.Group>
            <Form.Group className="mb-4" controlId="confirmacao">
              <Form.Label>Repita a nova senha</Form.Label>
              <Form.Control type="password" autoComplete="new-password" minLength={8} required {...campo("confirmacao")} />
            </Form.Group>
            <div className="d-flex justify-content-end gap-2">
              <Button variant="outline-secondary" onClick={() => navegar(-1)}>Cancelar</Button>
              <Button type="submit" disabled={enviando}>{enviando ? "Salvando…" : "Salvar nova senha"}</Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}
