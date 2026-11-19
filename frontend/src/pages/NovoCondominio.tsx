import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Spinner } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { api, mensagemDeErro } from "../api";
import { destinoInicial, useAuth } from "../auth";
import { CamposCondominio, CamposMandato, condominioVazio, mandatoVazio } from "../components/FormCondominio";
import { useFeedback } from "../components/Feedback";
import { Icone, Marca } from "../components/ui";
import type { DadosCondominio, DadosMandato, Sessao } from "../tipos";

/** Quem já tem conta cadastra (mais) um condomínio e vira síndico dele. */
export default function NovoCondominio() {
  const { aplicar, condominioAtual, usuario, sair } = useAuth();
  const { avisar } = useFeedback();
  const navegar = useNavigate();
  const [m, setM] = useState<DadosMandato>(mandatoVazio);
  const [c, setC] = useState<DadosCondominio>(condominioVazio);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const s = await api.post<Sessao & { mensagem: string }>("/condominios", { condominio: c, mandato: m });
      aplicar(s);
      avisar(s.mensagem);
      navegar(destinoInicial(s), { replace: true });
    } catch (err) {
      setErro(mensagemDeErro(err));
      setEnviando(false);
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="pagina-solta">
      <header className="d-flex justify-content-between align-items-center mb-4">
        <Link to="/" className="marca"><Marca /></Link>
        {condominioAtual
          ? <Link to={destinoInicial({ usuario, condominio_atual: condominioAtual })} className="small text-body-secondary">← Voltar ao {condominioAtual.nome}</Link>
          : <Button variant="link" size="sm" className="text-body-secondary" onClick={async () => { await sair(); navegar("/"); }}>Sair</Button>}
      </header>
      <div className="mx-auto" style={{ maxWidth: 720 }}>
        <h1 className="pagina-titulo mb-2">Cadastrar condomínio</h1>
        <p className="text-body-secondary mb-4">Você será o síndico dele no sistema. Depois é só cadastrar as unidades e os moradores.</p>
        {erro && <Alert variant="danger" className="py-2 small">{erro}</Alert>}
        <form onSubmit={enviar}>
          <Card className="mb-4"><Card.Body className="p-4">
            <h2 className="h6 mb-3">Seu mandato</h2>
            <CamposMandato m={m} muda={(k, v) => setM((a) => ({ ...a, [k]: v }))} />
          </Card.Body></Card>
          <Card className="mb-4"><Card.Body className="p-4">
            <h2 className="h6 mb-3">Dados do condomínio</h2>
            <CamposCondominio c={c} muda={(k, v) => setC((a) => ({ ...a, [k]: v }))} />
          </Card.Body></Card>
          <div className="d-flex justify-content-end">
            <Button type="submit" size="lg" disabled={enviando}>
              {enviando ? <><Spinner size="sm" /> Criando…</> : <><Icone nome="check" /> Criar condomínio</>}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
