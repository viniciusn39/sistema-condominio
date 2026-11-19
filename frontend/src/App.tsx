import { useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { LayoutApp, Protegido } from "./components/Layout";
import BemVindo from "./pages/BemVindo";
import Cadastro from "./pages/Cadastro";
import Entrar from "./pages/Entrar";
import NovoCondominio from "./pages/NovoCondominio";
import Condominio from "./pages/admin/Condominio";
import Inicio from "./pages/Inicio";
import Avisos from "./pages/Avisos";
import Documentos from "./pages/Documentos";
import TrocarSenha from "./pages/TrocarSenha";
import Votacao from "./pages/Votacao";
import Votacoes from "./pages/Votacoes";
import Importar from "./pages/admin/Importar";
import Mapa from "./pages/admin/Mapa";
import Moradores from "./pages/admin/Moradores";
import Painel from "./pages/admin/Painel";
import Unidades from "./pages/admin/Unidades";
import VotacaoForm from "./pages/admin/VotacaoForm";

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });  // troca de página: sem a rolagem suave
  }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/cadastro" element={<Cadastro />} />

      <Route element={<Protegido semCondominio />}>
        <Route path="/bem-vindo" element={<BemVindo />} />
        <Route path="/condominios/novo" element={<NovoCondominio />} />
      </Route>

      <Route element={<Protegido />}>
        <Route element={<LayoutApp />}>
          <Route path="/votacoes" element={<Votacoes />} />
          <Route path="/votacoes/:id" element={<Votacao />} />
          <Route path="/avisos" element={<Avisos />} />
          <Route path="/documentos" element={<Documentos />} />
          <Route path="/conta/senha" element={<TrocarSenha />} />
          <Route element={<Protegido admin />}>
            <Route path="/admin" element={<Painel />} />
            <Route path="/admin/votacoes/nova" element={<VotacaoForm />} />
            <Route path="/admin/votacoes/:id/editar" element={<VotacaoForm />} />
            <Route path="/admin/moradores" element={<Moradores />} />
            <Route path="/admin/unidades" element={<Unidades />} />
            <Route path="/admin/mapa" element={<Mapa />} />
            <Route path="/admin/condominio" element={<Condominio />} />
            <Route path="/admin/importar" element={<Importar />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NaoEncontrada />} />
    </Routes>
  );
}

function NaoEncontrada() {
  return (
    <div className="container py-5 text-center" style={{ maxWidth: 520 }}>
      <p className="font-monospace text-body-secondary mb-2">Erro 404</p>
      <h1 className="pagina-titulo mb-3">Página não encontrada</h1>
      <p className="text-body-secondary mb-4">O endereço pode ter mudado ou a página não existe mais.</p>
      <Link className="btn btn-primary" to="/">Voltar para o início</Link>
    </div>
  );
}
