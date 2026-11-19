import { Navigate, Link, useNavigate } from "react-router-dom";
import { Button, Card } from "react-bootstrap";
import { destinoInicial, useAuth } from "../auth";
import { Icone, Marca } from "../components/ui";
import { primeiroNome } from "../formato";

/** Conta sem nenhum condomínio ativo: síndico cadastra o seu; morador aguarda o síndico. */
export default function BemVindo() {
  const { usuario, condominioAtual, sair } = useAuth();
  const navegar = useNavigate();
  if (!usuario) return <Navigate to="/entrar" replace />;
  if (condominioAtual) return <Navigate to={destinoInicial({ usuario, condominio_atual: condominioAtual })} replace />;

  return (
    <div className="pagina-solta">
      <header className="d-flex justify-content-between align-items-center mb-5">
        <Link to="/" className="marca"><Marca /></Link>
        <Button variant="link" size="sm" className="text-body-secondary" onClick={async () => { await sair(); navegar("/"); }}>Sair</Button>
      </header>
      <div className="mx-auto text-center" style={{ maxWidth: 640 }}>
        <h1 className="pagina-titulo mb-2">Olá, {primeiroNome(usuario.nome)}!</h1>
        <p className="text-body-secondary mb-5">Sua conta ainda não está ligada a nenhum condomínio.</p>
        <div className="row g-3 text-start">
          <div className="col-md-6">
            <Card className="h-100"><Card.Body className="p-4">
              <span className="numero-icone mb-3"><Icone nome="predio" /></span>
              <h2 className="h6">Sou síndico</h2>
              <p className="small text-body-secondary">Cadastre o condomínio para começar a usar o sistema.</p>
              <Link to="/condominios/novo" className="btn btn-primary btn-sm">Cadastrar condomínio</Link>
            </Card.Body></Card>
          </div>
          <div className="col-md-6">
            <Card className="h-100"><Card.Body className="p-4">
              <span className="numero-icone mb-3"><Icone nome="usuarios" /></span>
              <h2 className="h6">Sou morador</h2>
              <p className="small text-body-secondary mb-0">Peça ao síndico para incluir você no condomínio usando o seu e-mail ({usuario.email}). Depois é só entrar de novo.</p>
            </Card.Body></Card>
          </div>
        </div>
      </div>
    </div>
  );
}
